/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client with Multi-Key Pool & 429 Failover.
 * - Supports new AQ. and legacy AIza keys via x-goog-api-key header
 * - BLOCK_NONE safety filters on the 4 supported categories
 * - Automatic empty content part filtering to avoid 400 Bad Request
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
  // Only the 4 supported categories accept BLOCK_NONE without 400 Bad Request
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
    const maxAttempts = Math.max(availableKeys.length * 2, 3);

    // Sanitize contents: remove any empty parts to prevent 400 Bad Request
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

    // Ensure contents starts with 'user'
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

    // Attach system instruction if non-empty
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
      const modelId = studioPayload.studioId || 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`;

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
        console.warn(`[Studio API] Key ...${apiKey.slice(-6)} hit 429 (Rate Limit). Rotating keys...`);
        studioKeyManager.markCooldown(apiKey, 45000);
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
                  // Skip partial frame
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

    throw lastError || new Error('All Google AI Studio keys exhausted or rejected.');
  }

  static async completeText(studioPayload, availableKeys, temperature = 0.8) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, availableKeys, temperature)) {
      fullOutput += chunk;
    }
    return cleanText(fullOutput);
  }
}
