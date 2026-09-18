/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client targeting Gemini 3.8 / 3.7 Flash.
 * - Multi-part array reading (captures narrative across all parts)
 * - Detects finishReason: SAFETY and promptFeedback blockReason
 * - Multi-Key Pool & 429 Failover
 * - BLOCK_NONE safety filters
 */

import { config } from './config.js';
import { StreamCleaner, cleanText } from './cleaner.js';

export class StudioKeyManager {
  constructor() {
    this.keyIndex = 0;
    this.cooldowns = new Map();
  }

  extractKeys(authHeader = '') {
    const rawBearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const candidates = [];

    if (rawBearer && !/^(no-key|none|dummy|null|undefined|test)$/i.test(rawBearer)) {
      const splitKeys = rawBearer
        .split(/[,;\s]+/)
        .map((k) => k.trim())
        .filter((k) => k.startsWith('AQ.') || k.startsWith('AIza') || k.length >= 20);
      candidates.push(...splitKeys);
    }

    if (Array.isArray(config.studioApiKeys) && config.studioApiKeys.length > 0) {
      candidates.push(...config.studioApiKeys);
    }

    return [...new Set(candidates)];
  }

  getNextHealthyKey(keys) {
    if (!keys || keys.length === 0) return null;

    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const idx = (this.keyIndex + i) % keys.length;
      const key = keys[idx];
      const cooldownUntil = this.cooldowns.get(key) || 0;

      if (now >= cooldownUntil) {
        this.keyIndex = (idx + 1) % keys.length;
        return key;
      }
    }

    this.keyIndex = (this.keyIndex + 1) % keys.length;
    return keys[this.keyIndex];
  }

  markCooldown(key, durationMs = 30000) {
    this.cooldowns.set(key, Date.now() + durationMs);
  }
}

export const studioKeyManager = new StudioKeyManager();

export class GeminiStudioClient {
  static getSafetySettings() {
    return [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ];
  }

  static async *streamCompletion(studioPayload, availableKeys, temperature = 0.8) {
    let lastError = null;
    const maxAttempts = Math.max(availableKeys.length * 2, 4);

    const rawContents = Array.isArray(studioPayload.contents) ? studioPayload.contents : [];
    const validContents = rawContents
      .map((item) => ({
        role: item.role === 'model' ? 'model' : 'user',
        parts: (item.parts || []).filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
      }))
      .filter((item) => item.parts.length > 0);

    if (validContents.length === 0) {
      validContents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    if (validContents[0].role === 'model') {
      validContents.unshift({ role: 'user', parts: [{ text: '(Roleplay Context)' }] });
    }

    const requestBody = {
      contents: validContents,
      safetySettings: GeminiStudioClient.getSafetySettings(),
      generationConfig: {
        temperature: Number(temperature) || 0.8,
        topP: 0.95
      }
    };

    const sysText = studioPayload.systemInstruction?.parts?.[0]?.text?.trim();
    if (sysText) {
      requestBody.systemInstruction = {
        parts: [{ text: sysText }]
      };
    }

    let targetModelId = studioPayload.studioId || 'gemini-3.8-flash';
    if (targetModelId.includes('2.5') || targetModelId.includes('2.0')) {
      targetModelId = 'gemini-3.8-flash';
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = studioKeyManager.getNextHealthyKey(availableKeys);
      if (!apiKey) throw new Error('No valid Google AI Studio API key provided.');

      const cleaner = new StreamCleaner();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModelId}:streamGenerateContent?alt=sse`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      let res;
      let hasEmittedTokens = false;
      let safetyBlocked = false;

      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
      } catch (networkErr) {
        clearTimeout(timeoutId);
        lastError = networkErr;
        continue;
      }

      if (res.status === 429) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Key ...${apiKey.slice(-6)} hit 429. Rotating key...`);
        studioKeyManager.markCooldown(apiKey, 45000);
        continue;
      }

      if (res.status === 404) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Model '${targetModelId}' returned 404. Falling back to 'gemini-3.8-flash'...`);
        targetModelId = 'gemini-3.8-flash';
        continue;
      }

      if (!res.ok) {
        clearTimeout(timeoutId);
        const errText = await res.text();
        console.error(`[Studio API Error] HTTP ${res.status}: ${errText}`);
        lastError = new Error(`Google AI Studio HTTP ${res.status}: ${errText}`);

        if (res.status === 400 && errText.includes('API_KEY_INVALID')) {
          studioKeyManager.markCooldown(apiKey, 3600000);
        }
        continue;
      }

      if (!res.body) {
        clearTimeout(timeoutId);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes('\n\n')) {
            const eventEnd = buffer.indexOf('\n\n');
            const eventBlock = buffer.slice(0, eventEnd).trim();
            buffer = buffer.slice(eventEnd + 2);

            const lines = eventBlock.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const rawJson = line.slice(6).trim();
                if (!rawJson || rawJson === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(rawJson);

                  // Check prompt level blocks
                  if (parsed.promptFeedback?.blockReason) {
                    console.warn(`[Studio API] Prompt blocked by Google: ${parsed.promptFeedback.blockReason}`);
                    safetyBlocked = true;
                    lastError = new Error(`Prompt blocked by Google: ${parsed.promptFeedback.blockReason}`);
                  }

                  const candidate = parsed.candidates?.[0];
                  if (candidate) {
                    if (candidate.finishReason === 'SAFETY') {
                      console.warn(`[Studio API] Output blocked by Google (finishReason: SAFETY)`);
                      safetyBlocked = true;
                      lastError = new Error(`Output was blocked by Google safety filter (finishReason: SAFETY).`);
                    }

                    // Iterate over ALL parts in candidate content
                    if (Array.isArray(candidate.content?.parts)) {
                      for (const part of candidate.content.parts) {
                        if (part.thought) continue; // Skip thought tokens
                        if (typeof part.text === 'string' && part.text.length > 0) {
                          const cleaned = cleaner.process(part.text);
                          if (cleaned) {
                            hasEmittedTokens = true;
                            yield cleaned;
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  // Skip malformed SSE frame
                }
              }
            }
          }
        }

        const flushed = cleaner.flush();
        if (flushed) {
          hasEmittedTokens = true;
          yield flushed;
        }

        clearTimeout(timeoutId);

        // If Google closed the stream without generating any tokens:
        if (!hasEmittedTokens) {
          if (safetyBlocked) {
            throw lastError || new Error('Google filtered the response for safety.');
          }
          throw new Error('Google returned an empty completion.');
        }

        return; // Success
      } catch (streamErr) {
        clearTimeout(timeoutId);
        if (hasEmittedTokens) throw streamErr;
        lastError = streamErr;
      } finally {
        reader.releaseLock();
      }
    }

    throw lastError || new Error('All Google AI Studio attempts exhausted or blocked.');
  }

  static async completeText(studioPayload, availableKeys, temperature = 0.8) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, availableKeys, temperature)) {
      fullOutput += chunk;
    }
    const sanitized = cleanText(fullOutput);
    if (!sanitized || sanitized.trim().length === 0) {
      throw new Error('Google returned an empty completion (likely filtered by finishReason: SAFETY).');
    }
    return sanitized;
  }
}/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client targeting Gemini 3.8 Flash.
 * - Auto-routes to gemini-3.8-flash
 * - Multi-Key Pool & 429 Failover
 * - BLOCK_NONE safety filters
 * - Automatic empty content part filtering
 */

import { config } from './config.js';
import { StreamCleaner, cleanText } from './cleaner.js';

export class StudioKeyManager {
  constructor() {
    this.keyIndex = 0;
    this.cooldowns = new Map();
  }

  extractKeys(authHeader = '') {
    const rawBearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const candidates = [];

    if (rawBearer && !/^(no-key|none|dummy|null|undefined|test)$/i.test(rawBearer)) {
      const splitKeys = rawBearer
        .split(/[,;\s]+/)
        .map((k) => k.trim())
        .filter((k) => k.startsWith('AQ.') || k.startsWith('AIza') || k.length >= 20);
      candidates.push(...splitKeys);
    }

    if (Array.isArray(config.studioApiKeys) && config.studioApiKeys.length > 0) {
      candidates.push(...config.studioApiKeys);
    }

    return [...new Set(candidates)];
  }

  getNextHealthyKey(keys) {
    if (!keys || keys.length === 0) return null;

    const now = Date.now();
    for (let i = 0; i < keys.length; i++) {
      const idx = (this.keyIndex + i) % keys.length;
      const key = keys[idx];
      const cooldownUntil = this.cooldowns.get(key) || 0;

      if (now >= cooldownUntil) {
        this.keyIndex = (idx + 1) % keys.length;
        return key;
      }
    }

    this.keyIndex = (this.keyIndex + 1) % keys.length;
    return keys[this.keyIndex];
  }

  markCooldown(key, durationMs = 30000) {
    this.cooldowns.set(key, Date.now() + durationMs);
  }
}

export const studioKeyManager = new StudioKeyManager();

export class GeminiStudioClient {
  static getSafetySettings() {
    return [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ];
  }

  static async *streamCompletion(studioPayload, availableKeys, temperature = 0.8) {
    let lastError = null;
    const maxAttempts = Math.max(availableKeys.length * 2, 4);

    const rawContents = Array.isArray(studioPayload.contents) ? studioPayload.contents : [];
    const validContents = rawContents
      .map((item) => ({
        role: item.role === 'model' ? 'model' : 'user',
        parts: (item.parts || []).filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
      }))
      .filter((item) => item.parts.length > 0);

    if (validContents.length === 0) {
      validContents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    if (validContents[0].role === 'model') {
      validContents.unshift({ role: 'user', parts: [{ text: '(Roleplay Context)' }] });
    }

    const requestBody = {
      contents: validContents,
      safetySettings: GeminiStudioClient.getSafetySettings(),
      generationConfig: {
        temperature: Number(temperature) || 0.8,
        topP: 0.95
      }
    };

    const sysText = studioPayload.systemInstruction?.parts?.[0]?.text?.trim();
    if (sysText) {
      requestBody.systemInstruction = {
        parts: [{ text: sysText }]
      };
    }

    // Direct resolution: Target Gemini 3.8 Flash
    let targetModelId = studioPayload.studioId || 'gemini-3.8-flash';
    if (targetModelId.includes('2.5') || targetModelId.includes('2.0')) {
      targetModelId = 'gemini-3.8-flash';
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = studioKeyManager.getNextHealthyKey(availableKeys);
      if (!apiKey) throw new Error('No valid Google AI Studio API key provided.');

      const cleaner = new StreamCleaner();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModelId}:streamGenerateContent?alt=sse`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      let res;
      let hasEmittedTokens = false;

      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
      } catch (networkErr) {
        clearTimeout(timeoutId);
        lastError = networkErr;
        continue;
      }

      // Handle 429 Rate Limit
      if (res.status === 429) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Key ...${apiKey.slice(-6)} hit 429. Rotating key...`);
        studioKeyManager.markCooldown(apiKey, 45000);
        continue;
      }

      // If a model returns 404, fallback directly to gemini-3.8-flash
      if (res.status === 404) {
        clearTimeout(timeoutId);
        const errText = await res.text();
        console.warn(`[Studio API] Model '${targetModelId}' returned 404. Falling back to 'gemini-3.8-flash'...`);
        targetModelId = 'gemini-3.8-flash';
        lastError = new Error(`Model 404: ${errText}`);
        continue;
      }

      if (!res.ok) {
        clearTimeout(timeoutId);
        const errText = await res.text();
        console.error(`[Studio API Error] HTTP ${res.status}: ${errText}`);
        lastError = new Error(`Google AI Studio HTTP ${res.status}: ${errText}`);

        if (res.status === 400 && errText.includes('API_KEY_INVALID')) {
          studioKeyManager.markCooldown(apiKey, 3600000);
        }
        continue;
      }

      if (!res.body) {
        clearTimeout(timeoutId);
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes('\n\n')) {
            const eventEnd = buffer.indexOf('\n\n');
            const eventBlock = buffer.slice(0, eventEnd).trim();
            buffer = buffer.slice(eventEnd + 2);

            const lines = eventBlock.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const rawJson = line.slice(6).trim();
                if (!rawJson || rawJson === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(rawJson);
                  const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (textPart) {
                    const cleaned = cleaner.process(textPart);
                    if (cleaned) {
                      hasEmittedTokens = true;
                      yield cleaned;
                    }
                  }
                } catch (e) {
                  // Partial frame skip
                }
              }
            }
          }
        }

        const flushed = cleaner.flush();
        if (flushed) yield flushed;

        clearTimeout(timeoutId);
        return;
      } catch (streamErr) {
        clearTimeout(timeoutId);
        if (hasEmittedTokens) throw streamErr;
        lastError = streamErr;
      } finally {
        reader.releaseLock();
      }
    }

    throw lastError || new Error('All Google AI Studio attempts exhausted.');
  }

  static async completeText(studioPayload, availableKeys, temperature = 0.8) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, availableKeys, temperature)) {
      fullOutput += chunk;
    }
    return cleanText(fullOutput);
  }
}
