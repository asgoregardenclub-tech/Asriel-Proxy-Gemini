/**
 * server.js (v1.1 Update)
 * Native Node.js v26 ECMAScript Module HTTP server.
 * Features:
 *   - Real-time ANSI terminal logging for incoming requests, success dispatches, and session rotations.
 *   - Standard OpenAI API endpoints (/v1/models, /v1/chat/completions).
 *   - Stream and JSON completion handling with automatic session error recovery.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { sessionPool } from './sessionPool.js';
import { ContextBuilder } from './contextBuilder.js';
import { GeminiClient } from './geminiClient.js';

// ANSI Color Palette with automatic TTY fallback
const isTTY = Boolean(process.stdout.isTTY || process.env.TERM);
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[90m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  red: isTTY ? '\x1b[31m' : '',
  blue: isTTY ? '\x1b[34m' : ''
};

function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function logIncoming(model, isStream) {
  const ts = getTimestamp();
  console.log(
    `${c.dim}[${ts}]${c.reset} ${c.yellow}${c.bold}[INCOMING]${c.reset} Request received from JanitorAI -> Model: ${c.cyan}${model}${c.reset} | Stream: ${c.magenta}${isStream}${c.reset}`
  );
}

function logSuccess(turnCount) {
  const ts = getTimestamp();
  console.log(
    `${c.dim}[${ts}]${c.reset} ${c.green}${c.bold}[SUCCESS]${c.reset} Completed response dispatched to JanitorAI (${turnCount} turns in context)`
  );
}

function logRotate() {
  const ts = getTimestamp();
  console.log(
    `${c.dim}[${ts}]${c.reset} ${c.blue}${c.bold}[INFO]${c.reset} Rotating to fresh Gemini guest session...`
  );
}

// Hook session rotator to display console logs when invalidations trigger
const originalInvalidate = sessionPool.invalidateSession.bind(sessionPool);
sessionPool.invalidateSession = (session) => {
  logRotate();
  return originalInvalidate(session);
};

function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Requested-With');
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100 * 1024 * 1024) {
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', (err) => reject(err));
  });
}

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

    const turnCount = messages.length;
    logIncoming(model, stream);

    const conversationId =
      req.headers['x-session-id'] ||
      crypto.createHash('sha256').update(JSON.stringify(messages.slice(0, 2))).digest('hex');

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
          logSuccess(turnCount);
        }
      } catch (streamErr) {
        console.error(`${c.red}[ERROR] Streaming fault: ${streamErr.message}${c.reset}`);
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
      logSuccess(turnCount);
    } catch (completeErr) {
      console.error(`${c.red}[ERROR] Non-streaming completion failure: ${completeErr.message}${c.reset}`);
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

  sendJson(res, 404, {
    error: { message: `Endpoint not found: ${pathname}`, type: 'invalid_request_error', code: 404 }
  });
});

server.listen(config.port, config.host, async () => {
  console.log(`${c.cyan}====================================================${c.reset}`);
  console.log(`${c.cyan}${c.bold}     ASRIEL-PROXY-GEMINI (v1.1) : ONLINE            ${c.reset}`);
  console.log(`${c.cyan}====================================================${c.reset}`);
  console.log(`[Host Binding]     : http://${config.host}:${config.port}`);
  console.log(`[JanitorAI URL]    : http://localhost:${config.port}/v1`);
  console.log(`[Default Model]    : ${config.defaultModel}`);
  console.log(`[Thinking Budget]  : ${config.thinkingBudgetTokens} tokens`);
  console.log(`[Logging Engine]   : Real-Time ANSI Visual Feed Active`);
  console.log('----------------------------------------------------');

  await sessionPool.initialize();
  console.log(`${c.green}[System] Ready to serve JanitorAI roleplay sessions.${c.reset}`);
});
