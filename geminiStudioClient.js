/**
 * geminiStudioClient.js
 * Direct Google AI Studio API client.
 * Features:
 * - BLOCK_NONE safety filters (Identical to GeminiForJanitors)
 * - Native multi-turn systemInstruction and contents schema
 * - Thinking budget configuration
 */

import { config } from './config.js';
import { StreamCleaner, cleanText } from './cleaner.js';

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

  static async *streamCompletion(studioPayload, apiKey, temperature = 0.8) {
    const cleaner = new StreamCleaner();
    const modelId = studioPayload.studioId || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}&alt=sse`;

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
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google AI Studio HTTP ${res.status}: ${errText}`);
    }

    if (!res.body) throw new Error('AI Studio response body is null');

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
                  if (cleaned) yield cleaned;
                }
              } catch (e) {
                // Skip parse error on partial SSE frames
              }
            }
          }
        }
      }

      const flushed = cleaner.flush();
      if (flushed) yield flushed;
    } finally {
      reader.releaseLock();
    }
  }

  static async completeText(studioPayload, apiKey, temperature = 0.8) {
    let fullOutput = '';
    for await (const chunk of GeminiStudioClient.streamCompletion(studioPayload, apiKey, temperature)) {
      fullOutput += chunk;
    }
    return cleanText(fullOutput);
  }
}
