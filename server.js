/**
 * server.js
 * Asriel-Proxy-Gemini v2.4
 * - Full JanitorAI Slider Passthrough (temp, top_p, max_tokens, penalties)
 * - Dual-Engine Routing (Studio API Multi-Key vs Free Guest Web)
 * - Universal Path Routing (/v1, /v1/chat/completions, /chat/completions)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { config, resolveModel } from './config.js';
import { sessionPool } from './sessionPool.js';
import { ContextBuilder } from './contextBuilder.js';
import { GeminiGuestClient } from './geminiGuestClient.js';
import { GeminiStudioClient, studioKeyManager } from './geminiStudioClient.js';

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

function logIncoming(model, engine, isStream, temp) {
  const ts = getTimestamp();
  console.log(
    `${c.dim}[${ts}]${c.reset} ${c.yellow}${c.bold}[INCOMING]${c.reset} JanitorAI -> Model: ${c.cyan}${model}${c.reset} | Engine: ${c.green}${engine}${c.reset} | Stream: ${c.magenta}${isStream}${c.reset} | Temp: ${c.cyan}${temp}${c.reset}`
  );
}

function logSuccess(turnCount, engine) {
  const ts = getTimestamp();
  console.log(
    `${c.dim}[${ts}]${c.reset} ${c.green}${c.bold}[SUCCESS]${c.reset} Dispatched to JanitorAI (${turnCount} turns in context | ${engine})`
  );
}

function logRotate() {
  const ts = getTimestamp();
  console.log(
    `${c.dim}[${ts}]${c.reset} ${c.blue}${c.bold}[INFO]${c.reset} Rotating to fresh Gemini guest session...`
  );
}

sessionPool.setOnRotate(logRotate);

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
      if (body.length > 100 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
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
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

  if ((pathname === '/' || pathname === '/health') && req.method === 'GET') {
    sendJson(res, 200, {
      status: 'online',
      service: 'Asriel-Proxy-Gemini',
      version: '2.4.0 (Enhanced Roleplay Core)',
      guest_sessions_active: sessionPool.getActiveCount(),
      default_model: config.defaultModel
    });
    return;
  }

  if ((pathname === '/v1/models' || pathname === '/models' || pathname === '/v1') && req.method === 'GET') {
    const modelsList = Object.entries(config.modelMappings).map(([id, info]) => ({
      id,
      object: 'model',
      created: 1700000000,
      owned_by: 'google-hybrid',
      permission: [],
      root: id,
      parent: null,
      description: info.desc
    }));

    sendJson(res, 200, { object: 'list', data: modelsList });
    return;
  }

  const isChatCompletion =
    req.method === 'POST' &&
    (pathname.includes('/chat/completions') ||
     pathname === '/v1' ||
     pathname === '/');

  if (isChatCompletion) {
    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw || '{}');
    } catch (err) {
      sendJson(res, 400, {
        error: { message: `Malformed JSON: ${err.message}`, type: 'invalid_request_error', code: 400 }
      });
      return;
    }

    const { model = config.defaultModel, messages = [], stream = false } = payload;

    if (!Array.isArray(messages) || messages.length === 0) {
      sendJson(res, 400, {
        error: { message: 'The messages array cannot be empty.', type: 'invalid_request_error', code: 400 }
      });
      return;
    }

    // Dynamic JanitorAI UI Slider Passthrough
    const sampling = {
      temperature: typeof payload.temperature === 'number' ? payload.temperature : config.defaultTemperature,
      topP: typeof payload.top_p === 'number' ? payload.top_p : config.defaultTopP,
      maxOutputTokens: typeof payload.max_tokens === 'number' ? payload.max_tokens : (typeof payload.max_output_tokens === 'number' ? payload.max_output_tokens : undefined),
      frequencyPenalty: typeof payload.frequency_penalty === 'number' ? payload.frequency_penalty : config.defaultFrequencyPenalty,
      presencePenalty: typeof payload.presence_penalty === 'number' ? payload.presence_penalty : config.defaultPresencePenalty
    };

    const authHeader = req.headers.authorization || '';
    const availableKeys = studioKeyManager.extractKeys(authHeader);
    const isStudioMode = availableKeys.length > 0;
    const engineName = isStudioMode
      ? `Studio API (${availableKeys.length} key${availableKeys.length > 1 ? 's' : ''} | BLOCK_NONE)`
      : 'Guest Web (Free Zero-Key)';

    const turnCount = messages.length;
    logIncoming(model, engineName, stream, sampling.temperature);

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
          choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }]
        };
        res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

        let tokenStream;
        if (isStudioMode) {
          const studioPayload = ContextBuilder.buildStudioPayload(messages, model);
          tokenStream = GeminiStudioClient.streamCompletion(studioPayload, availableKeys, sampling);
        } else {
          const guestPrompt = ContextBuilder.buildGuestPrompt(messages, model);
          const conversationId =
            req.headers['x-session-id'] ||
            crypto.createHash('sha256').update(JSON.stringify(messages.slice(0, 2))).digest('hex');
          tokenStream = GeminiGuestClient.streamCompletion(guestPrompt, model, sessionPool, conversationId);
        }

        for await (const token of tokenStream) {
          if (clientDisconnected) break;

          const dataChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: createdTimestamp,
            model,
            choices: [{ index: 0, delta: { content: token }, finish_reason: null }]
          };
          res.write(`data: ${JSON.stringify(dataChunk)}\n\n`);
        }

        if (!clientDisconnected) {
          const stopChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: createdTimestamp,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
          };
          res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          logSuccess(turnCount, engineName);
        }
      } catch (streamErr) {
        console.error(`${c.red}[ERROR] Stream fault: ${streamErr.message}${c.reset}`);
        if (!clientDisconnected) {
          res.write(`data: ${JSON.stringify({ error: { message: streamErr.message, type: 'upstream_error', code: 502 } })}\n\n`);
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
      let completionText = '';
      if (isStudioMode) {
        const studioPayload = ContextBuilder.buildStudioPayload(messages, model);
        completionText = await GeminiStudioClient.completeText(studioPayload, availableKeys, sampling);
      } else {
        const guestPrompt = ContextBuilder.buildGuestPrompt(messages, model);
        const conversationId =
          req.headers['x-session-id'] ||
          crypto.createHash('sha256').update(JSON.stringify(messages.slice(0, 2))).digest('hex');
        completionText = await GeminiGuestClient.completeText(guestPrompt, model, sessionPool, conversationId);
      }

      const estimatedPromptTokens = Math.ceil(JSON.stringify(messages).length / 4);
      const estimatedCompletionTokens = Math.ceil(completionText.length / 4);

      sendJson(res, 200, {
        id: completionId,
        object: 'chat.completion',
        created: createdTimestamp,
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: completionText }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          total_tokens: estimatedPromptTokens + estimatedCompletionTokens
        }
      });
      logSuccess(turnCount, engineName);
    } catch (completeErr) {
      console.error(`${c.red}[ERROR] Completion fault: ${completeErr.message}${c.reset}`);
      sendJson(res, 502, {
        error: { message: `Gemini Upstream Error: ${completeErr.message}`, type: 'upstream_error', code: 502 }
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
  console.log(`${c.cyan}${c.bold}   ASRIEL-PROXY-GEMINI v2.4 (ENHANCED CORE)         ${c.reset}`);
  console.log(`${c.cyan}====================================================${c.reset}`);
  console.log(`[Host Binding]     : http://${config.host}:${config.port}`);
  console.log(`[JanitorAI URL]    : http://localhost:${config.port}/v1`);
  console.log(`[Default Model]    : ${config.defaultModel}`);
  console.log(`[Anti-Puppeteer]   : Active (Never speaks for {{user}})`);
  console.log(`[Anti-Catchphrase] : Active (Freq Decay: ${config.defaultFrequencyPenalty})`);
  console.log(`[Janitor Sliders]  : Temp, Top-P, Max Tokens, Penalties Forwarded`);
  console.log('----------------------------------------------------');

  await sessionPool.initialize();
  console.log(`${c.green}[System] Engine prewarmed. Ready to serve requests.${c.reset}`);
});
