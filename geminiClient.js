/**
 * geminiClient.js
 * Reverse-engineered Google Gemini Guest Web RPC client.
 * Dispatches StreamGenerate calls using Google JSPB multi-array payloads over fetch.
 */

import crypto from 'node:crypto';
import { config } from './config.js';
import { StreamCleaner, cleanText } from './cleaner.js';

export class GeminiClient {
  /**
   * Low-level raw stream generator communicating with Google's StreamGenerate endpoint.
   * Yields cumulative text frames emitted by the upstream model.
   */
  static async *rawStreamGenerate(prompt, modelName, session) {
    const modelDef = config.modelMappings[modelName] || config.modelMappings[config.defaultModel];
    const modelId = modelDef.mode;
    const thinkMode = modelDef.think;

    // Construct the 80-element inner JSPB array reverse-engineered from Gemini frontend
    const inner = new Array(80).fill(null);
    inner[0] = [prompt, 0, null, null, null, null, 0];
    inner[1] = ['en'];
    inner[2] = ['', '', '', null, null, null, null, null, null, ''];
    inner[6] = [0];
    inner[7] = 1;
    inner[10] = 1;
    inner[11] = 0;
    inner[17] = [[thinkMode]];
    inner[18] = 0;
    inner[27] = 1;
    inner[30] = [4];
    // Temporary Guest Chat Persistence Flags: do not attach to Google cloud storage
    inner[41] = [1];
    inner[45] = 1;
    inner[53] = 0;
    inner[59] = crypto.randomUUID();
    inner[61] = [];
    inner[68] = 1;
    inner[79] = modelId;

    const outer = [null, JSON.stringify(inner)];

    const formParams = new URLSearchParams();
    formParams.append('f.req', JSON.stringify(outer));
    if (session.snlm0e) {
      formParams.append('at', session.snlm0e);
    }

    const queryParams = new URLSearchParams({
      bl: session.bl || config.geminiBl,
      hl: 'en',
      _reqid: String(session.getNextReqId()),
      rt: 'c'
    });

    if (session.fSid) {
      queryParams.append('f.sid', session.fSid);
    }

    const url = `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${queryParams.toString()}`;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': config.userAgent,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://gemini.google.com',
      'Referer': 'https://gemini.google.com/',
      'X-Same-Domain': '1'
    };

    if (session.cookies) {
      headers['Cookie'] = session.cookies;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: formParams.toString(),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      throw new Error(`Upstream Gemini rejected with HTTP ${res.status}: ${res.statusText}`);
    }

    if (!res.body) {
      throw new Error('Upstream response body is null');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Intercept upstream structural errors (e.g. BardErrorInfo [1155] transient rejection, 1060 geo-block)
        if (buffer.includes('BardErrorInfo')) {
          const errMatch = buffer.match(/BardErrorInfo\s*\[(\d+)\]/);
          const errCode = errMatch ? errMatch[1] : 'Unknown';
          throw new Error(`Gemini upstream error code BardErrorInfo [${errCode}]`);
        }

        // Process line-delimited chunk frames
        while (buffer.includes('\n')) {
          const lineEnd = buffer.indexOf('\n');
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (!line.includes('"wrb.fr"') || line.length < 50) continue;

          try {
            const parsedArray = JSON.parse(line);
            const innerPayloadStr = parsedArray?.[0]?.[2];
            if (!innerPayloadStr || typeof innerPayloadStr !== 'string') continue;

            const candidateRoot = JSON.parse(innerPayloadStr);

            // Candidate parts array is located at candidateRoot[4]
            if (Array.isArray(candidateRoot) && candidateRoot.length > 4 && Array.isArray(candidateRoot[4])) {
              for (const candidatePart of candidateRoot[4]) {
                if (
                  Array.isArray(candidatePart) &&
                  candidatePart.length > 1 &&
                  Array.isArray(candidatePart[1])
                ) {
                  for (const textDelta of candidatePart[1]) {
                    if (typeof textDelta === 'string' && textDelta.length > 0) {
                      yield textDelta;
                    }
                  }
                }
              }
            }
          } catch (jsonErr) {
            // Partial packet skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Resilient incremental stream generator.
   * Calculates incremental token deltas from cumulative frames and runs real-time stream cleaning.
   */
  static async *streamCompletion(prompt, modelName, pool, conversationId = null) {
    let lastError = null;

    for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
      const session = await pool.acquireSession(conversationId);
      const cleaner = new StreamCleaner();
      let prevText = '';
      let hasEmittedTokens = false;

      try {
        const stream = GeminiClient.rawStreamGenerate(prompt, modelName, session);

        for await (const cumulativeText of stream) {
          if (cumulativeText.length > prevText.length) {
            let delta = '';
            if (cumulativeText.startsWith(prevText)) {
              delta = cumulativeText.slice(prevText.length);
            } else {
              delta = cumulativeText.slice(prevText.length);
            }

            prevText = cumulativeText;

            const cleanedDelta = cleaner.process(delta);
            if (cleanedDelta) {
              hasEmittedTokens = true;
              yield cleanedDelta;
            }
          }
        }

        const trailing = cleaner.flush();
        if (trailing) {
          hasEmittedTokens = true;
          yield trailing;
        }

        // If the generation completed successfully, exit retry loop
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[GeminiClient] Attempt ${attempt + 1}/${config.retryAttempts} failed: ${err.message}`);

        // Invalidate session immediately so pool fetches fresh tokens
        pool.invalidateSession(session);

        // If tokens were already sent to client, we cannot cleanly restart the stream
        if (hasEmittedTokens) {
          throw err;
        }

        if (attempt < config.retryAttempts - 1) {
          await new Promise((r) => setTimeout(r, config.retryDelayMs * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('All guest completion attempts were exhausted.');
  }

  /**
   * Non-streaming completion accumulator.
   */
  static async completeText(prompt, modelName, pool, conversationId = null) {
    let fullOutput = '';
    for await (const chunk of GeminiClient.streamCompletion(prompt, modelName, pool, conversationId)) {
      fullOutput += chunk;
    }
    return cleanText(fullOutput);
  }
}
