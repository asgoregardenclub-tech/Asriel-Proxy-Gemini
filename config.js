/**
 * config.js
 * Centralized Configuration & Comprehensive Google Gemini Model Directory.
 */

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',

  requestTimeoutMs: 180000,
  retryAttempts: 3,
  retryDelayMs: 1500,

  thinkingBudgetTokens: 5000,
  geminiBl: process.env.GEMINI_BL || 'boq_assistant-bard-web-server_20260716.08_p0',

  poolMinAlive: 2,
  poolMaxAlive: 8,
  sessionMaxAgeMs: 25 * 60 * 1000,
  sessionMaxUses: 40,

  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',

  defaultModel: 'gemini-3.8-flash',

  modelMappings: {
    // Gemini 3.8 Series
    'gemini-3.8-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.8 Flash' },
    'gemini-3.8-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.8 Flash Thinking' },
    'gemini-3.8-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.8 Thinking' },
    'gemini-3.8-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-2.5-pro', desc: 'Gemini 3.8 Pro' },

    // Gemini 3.7 Series
    'gemini-3.7-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.7 Flash' },
    'gemini-3.7-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.7 Flash Thinking' },
    'gemini-3.7-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-2.5-pro', desc: 'Gemini 3.7 Pro' },

    // Gemini 3.6 Series
    'gemini-3.6-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.6 Flash' },
    'gemini-3.6-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.6 Flash Thinking' },

    // Gemini 3.5 Series
    'gemini-3.5-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.5 Flash' },
    'gemini-3.5-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-2.5-flash', desc: 'Gemini 3.5 Flash Thinking' },
    'gemini-3.5-flash-lite': { mode: 6, think: 4, isThinking: false, studioId: 'gemini-2.0-flash-lite', desc: 'Gemini 3.5 Flash Lite' },
    'gemini-3.5-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-2.5-pro', desc: 'Gemini 3.5 Pro' },

    // Gemini 2.5 Series
    'gemini-2.5-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Gemini 2.5 Flash' },
    'gemini-2.5-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-2.5-pro', desc: 'Gemini 2.5 Pro' },
    'gemini-2.5-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-2.5-flash', desc: 'Gemini 2.5 Flash Thinking' },
    'gemini-2.5-flash-lite': { mode: 6, think: 4, isThinking: false, studioId: 'gemini-2.0-flash-lite', desc: 'Gemini 2.5 Flash Lite' },

    // Gemini 2.0 Series
    'gemini-2.0-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.0-flash', desc: 'Gemini 2.0 Flash' },
    'gemini-2.0-flash-lite': { mode: 6, think: 4, isThinking: false, studioId: 'gemini-2.0-flash-lite', desc: 'Gemini 2.0 Flash Lite' },
    'gemini-2.0-pro-exp-02-05': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-2.0-pro-exp-02-05', desc: 'Gemini 2.0 Pro Experimental' },

    // Gemini 1.5 Series
    'gemini-1.5-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-1.5-flash', desc: 'Gemini 1.5 Flash' },
    'gemini-1.5-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-1.5-pro', desc: 'Gemini 1.5 Pro' },

    // OpenAI Client Aliases
    'gpt-4o': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'GPT-4o Alias -> Gemini 3.8 Flash' },
    'gpt-4o-mini': { mode: 6, think: 4, isThinking: false, studioId: 'gemini-2.0-flash-lite', desc: 'GPT-4o Mini Alias -> Gemini Flash Lite' },
    'gpt-4': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'GPT-4 Alias -> Gemini 3.8 Flash' },
    'gpt-3.5-turbo': { mode: 6, think: 4, isThinking: false, studioId: 'gemini-2.0-flash-lite', desc: 'GPT-3.5 Turbo Alias -> Gemini Flash Lite' },
    'claude-3-7-sonnet': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Claude 3.7 Sonnet Alias -> Gemini 3.8 Flash' },
    'claude-3-5-sonnet': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-2.5-flash', desc: 'Claude 3.5 Sonnet Alias -> Gemini 3.8 Flash' }
  }
};

export function resolveModel(modelName = '') {
  const name = String(modelName).trim().toLowerCase();

  if (config.modelMappings[name]) {
    return { ...config.modelMappings[name], id: name };
  }

  if (name.includes('thinking') || name.includes('reason') || name.includes('deep')) {
    return {
      id: name,
      mode: 2,
      think: 0,
      isThinking: true,
      studioId: 'gemini-2.5-flash',
      desc: `Auto-configured Thinking Engine (${modelName})`
    };
  }

  if (name.includes('pro') || name.includes('ultra')) {
    return {
      id: name,
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-2.5-pro',
      desc: `Auto-configured Pro Engine (${modelName})`
    };
  }

  if (name.includes('lite') || name.includes('mini') || name.includes('nano') || name.includes('8b')) {
    return {
      id: name,
      mode: 6,
      think: 4,
      isThinking: false,
      studioId: 'gemini-2.0-flash-lite',
      desc: `Auto-configured Flash Lite Engine (${modelName})`
    };
  }

  const defaultDef = config.modelMappings[config.defaultModel];
  return { ...defaultDef, id: config.defaultModel };
}
