/**
 * config.js
 * Centralized Configuration & Gemini Model Directory.
 * Supports latest Gemini 3.x, 2.5, and 2.0 architectures with safety and thinking parameter matrices.
 */

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',

  requestTimeoutMs: 180000,
  retryAttempts: 3,
  retryDelayMs: 1200,

  thinkingBudgetTokens: 4096,
  geminiBl: process.env.GEMINI_BL || 'boq_assistant-bard-web-server_20260716.08_p0',

  poolMinAlive: 2,
  poolMaxAlive: 8,
  sessionMaxAgeMs: 25 * 60 * 1000,
  sessionMaxUses: 40,

  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',

  defaultModel: 'gemini-3.8-flash',
  defaultTemperature: 0.85,
  defaultTopP: 0.95,
  defaultFrequencyPenalty: 0.0,
  defaultPresencePenalty: 0.0,

  enableGoogleSearch: false,

  // Automatically parse studio keys from standard environment variables
  studioApiKeys: [
    ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []),
    ...(process.env.GOOGLE_API_KEY ? [process.env.GOOGLE_API_KEY] : []),
    ...(process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(/[,;\s]+/) : []),
    ...(process.env.STUDIO_API_KEYS ? process.env.STUDIO_API_KEYS.split(/[,;\s]+/) : [])
  ]
    .map((k) => k.trim())
    .filter((k) => k.length >= 20),

  modelMappings: {
    // =========================================================================
    // Gemini 3 Series (Uses thinkingLevel: minimal|low|medium|high, NO penalties)
    // =========================================================================
    'gemini-3.8-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-3.8-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.8 Flash (High Speed / Minimal Thinking)'
    },
    'gemini-3.8-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.8-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.8 Flash (Extended Reasoning / High Thinking)'
    },
    'gemini-3.8-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.8-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.8 Thinking'
    },
    'gemini-3.8-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.8-pro',
      arch: 'gemini-3',
      desc: 'Gemini 3.8 Pro (Frontier Literary Engine)'
    },
    'gemini-3.7-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-3.7-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.7 Flash'
    },
    'gemini-3.7-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.7-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.7 Flash Thinking'
    },
    'gemini-3.7-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.7-pro',
      arch: 'gemini-3',
      desc: 'Gemini 3.7 Pro'
    },
    'gemini-3.6-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-3.6-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.6 Flash'
    },
    'gemini-3.6-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.6-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.6 Flash Thinking'
    },
    'gemini-3.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-3.5-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3.5 Flash'
    },
    'gemini-3.5-flash-lite': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-3.5-flash-lite',
      arch: 'gemini-3',
      desc: 'Gemini 3.5 Flash-Lite'
    },
    'gemini-3.1-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.1-pro',
      arch: 'gemini-3',
      desc: 'Gemini 3.1 Pro'
    },
    'gemini-3-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-3-flash',
      arch: 'gemini-3',
      desc: 'Gemini 3 Flash'
    },
    'gemini-3-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3-pro',
      arch: 'gemini-3',
      desc: 'Gemini 3 Pro'
    },

    // =========================================================================
    // Gemini 2.5 Series (Uses thinkingBudget: int, NO penalties)
    // =========================================================================
    'gemini-2.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-2.5-flash',
      arch: 'gemini-2.5',
      desc: 'Gemini 2.5 Flash'
    },
    'gemini-2.5-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      studioId: 'gemini-2.5-flash',
      arch: 'gemini-2.5',
      desc: 'Gemini 2.5 Flash Thinking'
    },
    'gemini-2.5-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-2.5-pro',
      arch: 'gemini-2.5',
      desc: 'Gemini 2.5 Pro (Mandatory Reasoning)'
    },
    'gemini-2.5-flash-lite': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-2.5-flash-lite',
      arch: 'gemini-2.5',
      desc: 'Gemini 2.5 Flash Lite'
    },

    // =========================================================================
    // Gemini 2.0 & 1.5 Legacy (Supports frequencyPenalty / presencePenalty)
    // =========================================================================
    'gemini-2.0-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-2.0-flash',
      arch: 'gemini-legacy',
      desc: 'Gemini 2.0 Flash'
    },
    'gemini-1.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      studioId: 'gemini-1.5-flash',
      arch: 'gemini-legacy',
      desc: 'Gemini 1.5 Flash'
    },
    'gemini-1.5-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-1.5-pro',
      arch: 'gemini-legacy',
      desc: 'Gemini 1.5 Pro'
    },

    // =========================================================================
    // OpenAI / Claude Aliases -> Automatically routed to Gemini 3.8
    // =========================================================================
    'gpt-4o': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', arch: 'gemini-3', desc: 'GPT-4o -> Gemini 3.8 Flash' },
    'gpt-4o-mini': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', arch: 'gemini-3', desc: 'GPT-4o Mini -> Gemini 3.8 Flash' },
    'gpt-4': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', arch: 'gemini-3', desc: 'GPT-4 -> Gemini 3.8 Flash' },
    'gpt-3.5-turbo': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', arch: 'gemini-3', desc: 'GPT-3.5 Turbo -> Gemini 3.8 Flash' },
    'claude-3-5-sonnet': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-3.8-pro', arch: 'gemini-3', desc: 'Claude 3.5 Sonnet -> Gemini 3.8 Pro' },
    'claude-3-7-sonnet': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-3.8-pro', arch: 'gemini-3', desc: 'Claude 3.7 Sonnet -> Gemini 3.8 Pro' }
  }
};

export function resolveModel(modelName = '') {
  const name = String(modelName).trim().toLowerCase();

  if (config.modelMappings[name]) {
    return { ...config.modelMappings[name], id: name };
  }

  // Smart heuristic resolution
  const isThinking = name.includes('thinking') || name.includes('reason') || name.includes('deep');
  const isPro = name.includes('pro') || name.includes('ultra');

  let arch = 'gemini-3';
  let studioId = 'gemini-3.8-flash';

  if (name.includes('2.5')) {
    arch = 'gemini-2.5';
    studioId = isPro ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  } else if (name.includes('2.0') || name.includes('1.5')) {
    arch = 'gemini-legacy';
    studioId = isPro ? 'gemini-1.5-pro' : 'gemini-2.0-flash';
  } else if (isPro) {
    studioId = 'gemini-3.8-pro';
  }

  return {
    id: name,
    mode: isPro ? 3 : isThinking ? 2 : 1,
    think: isThinking ? 0 : 4,
    isThinking,
    studioId,
    arch,
    desc: `Dynamic Auto-Routed Model (${modelName})`
  };
}
