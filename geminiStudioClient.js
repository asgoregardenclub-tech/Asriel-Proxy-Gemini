/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client with:
 * - Smart Model Cascading on 503 (3.8 -> 3.7 -> 3.6 on high demand)
 * - Snappy 25s per-attempt timeout (no more 3-minute hangs)
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

      // Snappy 25-second connection timeout per attempt (prevents 3-minute queue hangs)
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
        console.warn(`[Studio API] Attempt ${attempt + 1} timed out or network error on ${targetModelId}. Retrying...`);
        continue;
      }

      // Handle 429 Rate Limit (Per-Key Limit)
      if (res.status === 429) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Key ...${apiKey.slice(-6)} hit 429. Rotating key...`);
        studioKeyManager.markCooldown(apiKey, 45000);
        continue;
      }

      // Handle 503 High Demand (Server Congestion) -> Model Cascade
      if (res.status === 503) {
        clearTimeout(timeoutId);
        consecutive503Count++;
        console.warn(`[Studio API] HTTP 503 (High Demand) on ${targetModelId}.`);

        // If high demand persists, cascade to 3.7 or 3.6 to get an instant slot
        if (consecutive503Count === 2 && targetModelId === 'gemini-3.8-flash') {
          console.warn(`[Studio API] Cascading from gemini-3.8-flash -> gemini-3.7-flash to bypass queue...`);
          targetModelId = 'gemini-3.7-flash';
        } else if (consecutive503Count >= 3 && targetModelId !== 'gemini-3.6-flash') {
          console.warn(`[Studio API] Cascading to gemini-3.6-flash (Low Traffic Tier)...`);
          targetModelId = 'gemini-3.6-flash';
        }

        // 1-second breathing room before retry
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Handle 404 Model Deprecation
      if (res.status === 404) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Model '${targetModelId}' returned 404. Falling back to 'gemini-3.6-flash'...`);
        targetModelId = 'gemini-3.6-flash';
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

        return; // Success
      } catch (streamErr) {
        clearTimeout(timeoutId);
        if (hasEmittedTokens) throw streamErr;
        lastError = streamErr;
      } finally {
        reader.releaseLock();
      }
    }

    throw lastError || new Error('Google AI Studio is currently experiencing severe high demand across all models.');
  }

  static async completeText(studioPayload, availableKeys, temperature = 0.8) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, availableKeys, temperature)) {
      fullOutput += chunk;
    }
    const sanitized = cleanText(fullOutput);
    if (!sanitized || sanitized.trim().length === 0) {
      throw new Error('Google returned an empty completion.');
    }
    return sanitized;
  }
}
