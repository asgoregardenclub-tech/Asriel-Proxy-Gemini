/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client with Multi-Key Pool & 429 Failover.
 * Supports both new AQ. format and legacy AIza format keys via x-goog-api-key header.
 */

import { config } from './config.js';
import { StreamCleaner, cleanText } from './cleaner.js';

export class StudioKeyManager {
  constructor() {
    this.keyIndex = 0;
    this.cooldowns = new Map();
  }

  /**
   * Extracts and validates keys from JanitorAI header or config.
   * Recognizes both new 'AQ.' format and legacy 'AIza' format keys.
   */
  extractKeys(authHeader = '') {
    const rawBearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const candidates = [];

    // Filter out common dummy placeholders
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
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
    ];
  }

  static async *streamCompletion(studioPayload, availableKeys, temperature = 0.8) {
    let lastError = null;
    const maxAttempts = Math.max(availableKeys.length * 2, 3);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = studioKeyManager.getNextHealthyKey(availableKeys);
      if (!apiKey) throw new Error('No valid Google AI Studio API key provided.');

      const cleaner = new StreamCleaner();
      const modelId = studioPayload.studioId || 'gemini-2.5-flash';
      
      // Native endpoint with alt=sse parameter
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`;

      const requestBody = {
        contents: studioPayload.contents,
        systemInstruction: studioPayload.systemInstruction,
        safetySettings: GeminiStudioClient.getSafetySettings(),
        generationConfig: {
          temperature: Number(temperature) || 0.8,
          topP: 0.95
        }
      };

      if (studioPayload.isThinking) {
        requestBody.generationConfig.thinkingConfig = {
          thinkingBudget: config.thinkingBudgetTokens
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      let res;
      let hasEmittedTokens = false;

      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Pass via x-goog-api-key header (required for AQ. format keys)
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

      // Handle 429 Rate Limits with Key Rotation
      if (res.status === 429) {
        clearTimeout(timeoutId);
        console.warn(`[Studio API] Key ...${apiKey.slice(-6)} hit 429 (Rate Limit). Rotating to next key...`);
        studioKeyManager.markCooldown(apiKey, 45000);
        continue;
      }

      if (!res.ok) {
        clearTimeout(timeoutId);
        const errText = await res.text();
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
                  // Partial chunk frame skip
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

    throw lastError || new Error('All Google AI Studio keys exhausted or rate-limited.');
  }

  static async completeText(studioPayload, availableKeys, temperature = 0.8) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, availableKeys, temperature)) {
      fullOutput += chunk;
    }
    return cleanText(fullOutput);
  }
}
