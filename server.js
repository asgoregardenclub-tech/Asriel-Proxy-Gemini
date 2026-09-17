/**
 * server.js
 * Native Node.js v26 ECMAScript Module HTTP server.
 * Standard OpenAI API endpoints:
 *   - GET  /v1/models
 *   - POST /v1/chat/completions (supports SSE stream: true & standard JSON)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { sessionPool } from './sessionPool.js';
import { ContextBuilder } from './contextBuilder.js';
import { GeminiClient } from './geminiClient.js';

// Apply standard Cross-Origin Resource Sharing (CORS) headers
function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Requested-With');
}

// Send standard JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Parse incoming HTTP request body asynchronously
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Prevent unbounded memory payloads (100MB max)
      if (body.length > 100 * 1024 * 1024) {
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', (err) => reject(err));
  });
}

// Server request router
const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Root health check
  if ((pathname === '/' || pathname === '/health') && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'online',
      service: 'Asriel-Proxy-Gemini',
      node_version: process.version,
      active_sessions: sessionPool.getActiveCount(),
      default_model: config.defaultModel
    });
    return;
  }

  // GET /v1/models & /models
  if ((pathname === '/v1/models' || pathname === '/models') && req.method === 'GET') {
    const modelsList = Object.entries(config.modelMappings).map(([id, info]) => ({
      id,
      object: 'model',
      created: 1700000000,
      owned_by: 'google-gemini-guest',
      permission: [],
      root: id,
      parent: null,
      description: info.desc
    }));

    sendJson(res, 200, {
      object: 'list',
      data: modelsList
    });
    return;
  }

  // POST /v1/chat/completions & /chat/completions
  if ((pathname === '/v1/chat/completions' || pathname === '/chat/completions') && req.method === 'POST') {
    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw || '{}');
    } catch (err) {
      sendJson(res, 400, {
        error: { message: `Malformed JSON payload: ${err.message}`, type: 'invalid_request_error', code: 400 }
      });
      return;
    }

    const { model = config.defaultModel, messages = [], stream = false } = payload;

    if (!Array.isArray(messages) || messages.length === 0) {
      sendJson(res, 400, {
        error: { message: 'The messages array is required and cannot be empty.', type: 'invalid_request_error', code: 400 }
      });
      return;
    }

    // Isolate sessions per conversation using header or generated client hash
    const conversationId =
      req.headers['x-session-id'] ||
      crypto.createHash('sha256').update(JSON.stringify(messages.slice(0, 2))).digest('hex');

    // Build the sanitized, recency-locked, and budget-clamped prompt
    const finalPrompt = ContextBuilder.buildPrompt(messages, model);
    const completionId = `chatcmpl-${crypto.randomUUID()}`;
    const createdTimestamp = Math.floor(Date.now() / 1000);

    // ==========================================
    // SSE STREAMING MODE (stream: true)
    // ==========================================
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders?.();

      let clientDisconnected = false;
      req.on('close', () => {
        clientDisconnected = true;
      });

      try {
        // Send initial chunk containing the role delta
        const initialChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: createdTimestamp,
          model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null
            }
          ]
        };
        res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

        const tokenStream = GeminiClient.streamCompletion(finalPrompt, model, sessionPool, conversationId);

        for await (const token of tokenStream) {
          if (clientDisconnected) break;

          const dataChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: createdTimestamp,
            model,
            choices: [
              {
                index: 0,
                delta: { content: token },
                finish_reason: null
              }
            ]
          };
          res.write(`data: ${JSON.stringify(dataChunk)}\n\n`);
        }

        if (!clientDisconnected) {
          // Final terminating chunk with finish_reason: 'stop'
          const stopChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: createdTimestamp,
            model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop'
              }
            ]
          };
          res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
        }
      } catch (streamErr) {
        console.error(`[Server] Streaming fault: ${streamErr.message}`);
        if (!clientDisconnected) {
          const errPayload = {
            error: {
              message: streamErr.message,
              type: 'upstream_error',
              code: 502
            }
          };
          res.write(`data: ${JSON.stringify(errPayload)}\n\n`);
        }
      } finally {
        res.end();
      }
      return;
    }

    // ==========================================
    // NON-STREAMING JSON MODE (stream: false)
    // ==========================================
    try {
      const completionText = await GeminiClient.completeText(finalPrompt, model, sessionPool, conversationId);

      // Simple heuristic token count estimation
      const estimatedPromptTokens = Math.ceil(finalPrompt.length / 4);
      const estimatedCompletionTokens = Math.ceil(completionText.length / 4);

      const responseBody = {
        id: completionId,
        object: 'chat.completion',
        created: createdTimestamp,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: completionText
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          total_tokens: estimatedPromptTokens + estimatedCompletionTokens
        }
      };

      sendJson(res, 200, responseBody);
    } catch (completeErr) {
      console.error(`[Server] Non-streaming completion failure: ${completeErr.message}`);
      sendJson(res, 502, {
        error: {
          message: `Gemini Upstream Failed: ${completeErr.message}`,
          type: 'upstream_error',
          code: 502
        }
      });
    }
    return;
  }

  // 404 Route handler
  sendJson(res, 404, {
    error: { message: `Endpoint not found: ${pathname}`, type: 'invalid_request_error', code: 404 }
  });
});

// Launch server & prewarm session pool
server.listen(config.port, config.host, async () => {
  console.log('====================================================');
  console.log('       ASRIEL-PROXY-GEMINI : PRODUCTION READY       ');
  console.log('====================================================');
  console.log(`[Host Binding]     : http://${config.host}:${config.port}`);
  console.log(`[JanitorAI URL]    : http://localhost:${config.port}/v1`);
  console.log(`[Default Model]    : ${config.defaultModel}`);
  console.log(`[Thinking Budget]  : ${config.thinkingBudgetTokens} tokens`);
  console.log(`[Zero-Key Mode]    : 100% Free Gemini Guest Sessions`);
  console.log('----------------------------------------------------');

  await sessionPool.initialize();
  console.log('[System] Service ready to accept roleplay requests.');
});
