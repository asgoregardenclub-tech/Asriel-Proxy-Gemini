/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client with:
 * - Smart Penalty Compatibility Checker (protects Gemini 3.x from invalid penalty errors)
 * - Model Cascading on 503
 * - Multi-Key Pool & 429 Failover
 * - BLOCK_NONE safety filters
 */

import { config } from './config.js';
import { StreamCleaner, cleanText } from './cleaner.js';

function supportsPenalties(modelId = '') {
  const id = String(modelId).toLowerCase();
  if (id.includes('3.') || id.includes('gemini-3')) {
    return false;
  }
  return id.includes('1.5') || id.includes('2.0');
}

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

  static async *streamCompletion(studioPayload, availableKeys, sampling = {}) {
    let lastError = null;
    const maxAttempts = 6;
    let consecutive503Count = 0;

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

    let targetModelId = studioPayload.studioId || 'gemini-3.8-flash';
    if (targetModelId.includes('2.5') || targetModelId.includes('2.0')) {
      targetModelId = 'gemini-3.8-flash';
    }

    const generationConfig = {
      temperature: typeof sampling.temperature === 'number' ? sampling.temperature : config.defaultTemperature,
      topP: typeof sampling.topP === 'number' ? sampling.topP : config.defaultTopP
    };

    if (typeof sampling.maxOutputTokens === 'number' && sampling.maxOutputTokens > 0) {
      generationConfig.maxOutputTokens = sampling.maxOutputTokens;
    }

    if (supportsPenalties(targetModelId)) {
      if (typeof sampling.frequencyPenalty === 'number' && sampling.frequencyPenalty > 0) {
        generationConfig.frequencyPenalty = sampling.frequencyPenalty;
      }
      if (typeof sampling.presencePenalty === 'number' && sampling.presencePenalty > 0) {
        generationConfig.presencePenalty = sampling.presencePenalty;
      }
    }

    const requestBody = {
      contents: validContents,
      safetySettings: GeminiStudioClient.getSafetySettings(),
      generationConfig
    };

    if (studioPayload.enableSearch) {
      requestBody.tools = [{ googleSearch: {} }];
    }

    const sysText = studioPayload.systemInstruction?.parts?.[0]?.text?.trim();
    if (sysText) {
      requestBody.systemInstruction = {
        parts: [{ text: sysText }]
      };
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = studioKeyManager.getNextHealthyKey(availableKeys);
      if (!apiKey) throw new Error('No valid Google AI Studio API key provided.');

      const cleaner = new StreamCleaner();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModelId}:streamGenerateContent?alt=sse`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

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
        console.warn(`[Studio API] Attempt ${attempt + 1} timed out on ${targetModelId}. Retrying...`);
        continue;
      }

      if (res.status === 429) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Key ...${apiKey.slice(-6)} hit 429. Rotating key...`);
        studioKeyManager.markCooldown(apiKey, 45000);
        continue;
      }

      if (res.status === 503) {
        clearTimeout(timeoutId);
        consecutive503Count++;
        console.warn(`[Studio API] HTTP 503 (High Demand) on ${targetModelId}.`);

        if (consecutive503Count === 2 && targetModelId === 'gemini-3.8-flash') {
          console.warn(`[Studio API] Cascading to gemini-3.7-flash to bypass queue...`);
          targetModelId = 'gemini-3.7-flash';
        } else if (consecutive503Count >= 3 && targetModelId !== 'gemini-3.6-flash') {
          console.warn(`[Studio API] Cascading to gemini-3.6-flash...`);
          targetModelId = 'gemini-3.6-flash';
        }

        await new Promise((r) => setTimeout(r, 1000));
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

                  if (parsed.promptFeedback?.blockReason) {
                    console.warn(`[Studio API] Prompt blocked: ${parsed.promptFeedback.blockReason}`);
                    safetyBlocked = true;
                    lastError = new Error(`Prompt blocked: ${parsed.promptFeedback.blockReason}`);
                  }

                  const candidate = parsed.candidates?.[0];
                  if (candidate) {
                    if (candidate.finishReason === 'SAFETY') {
                      console.warn(`[Studio API] Output blocked (finishReason: SAFETY)`);
                      safetyBlocked = true;
                      lastError = new Error(`Output blocked by safety filter.`);
                    }

                    if (Array.isArray(candidate.content?.parts)) {
                      for (const part of candidate.content.parts) {
                        if (part.thought) continue;
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
                  // Skip malformed chunk
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

        if (!hasEmittedTokens) {
          if (safetyBlocked) throw lastError || new Error('Google filtered the response.');
          throw new Error('Empty completion received from upstream.');
        }

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

  static async completeText(studioPayload, availableKeys, sampling = {}) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, availableKeys, sampling)) {
      fullOutput += chunk;
    }
    const sanitized = cleanText(fullOutput);
    if (!sanitized || sanitized.trim().length === 0) {
      throw new Error('Google returned an empty completion.');
    }
    return sanitized;
  }
}

export default GeminiStudioClient;
