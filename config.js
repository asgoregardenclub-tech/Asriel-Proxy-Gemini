/**
 * config.js
 * Centralized Configuration & Universal Model Directory.
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

  // Default Sampling & Anti-Loop Defaults (Used if not overridden by Janitor sliders)
  defaultModel: 'gemini-3.8-flash',
  defaultTemperature: 0.8,
  defaultTopP: 0.95,
  defaultFrequencyPenalty: 0.35, // Anti-catchphrase decay for 50+ turn chats
  defaultPresencePenalty: 0.2,

  // Global search grounding toggle (also triggers on-demand via [ OOC: search: ... ])
  enableGoogleSearch: false,

  modelMappings: {
    // Gemini 3.8 Series (Flagships)
    'gemini-3.8-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'Gemini 3.8 Flash' },
    'gemini-3.8-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.8-flash', desc: 'Gemini 3.8 Flash Thinking' },
    'gemini-3.8-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.8-flash', desc: 'Gemini 3.8 Thinking' },
    'gemini-3.8-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-3.8-pro', desc: 'Gemini 3.8 Pro' },

    // Gemini 3.7 Series
    'gemini-3.7-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.7-flash', desc: 'Gemini 3.7 Flash' },
    'gemini-3.7-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.7-flash', desc: 'Gemini 3.7 Flash Thinking' },
    'gemini-3.7-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-3.7-pro', desc: 'Gemini 3.7 Pro' },

    // Gemini 3.6 Series
    'gemini-3.6-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.6-flash', desc: 'Gemini 3.6 Flash' },
    'gemini-3.6-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.6-flash', desc: 'Gemini 3.6 Flash Thinking' },

    // OpenAI Aliases
    'gpt-4o': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-4o -> Gemini 3.8 Flash' },
    'gpt-4o-mini': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-4o Mini -> Gemini 3.8 Flash' },
    'gpt-4': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-4 -> Gemini 3.8 Flash' },
    'gpt-3.5-turbo': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-3.5 Turbo -> Gemini 3.8 Flash' }
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
      studioId: 'gemini-3.8-flash',
      desc: `Auto-configured Thinking Engine (${modelName})`
    };
  }

  if (name.includes('pro') || name.includes('ultra')) {
    return {
      id: name,
      mode: 3,
      think: 0,
      isThinking: true,
      studioId: 'gemini-3.8-pro',
      desc: `Auto-configured Pro Engine (${modelName})`
    };
  }

  return {
    id: name,
    mode: 1,
    think: 4,
    isThinking: false,
    studioId: 'gemini-3.8-flash',
    desc: `Auto-configured Flash (${modelName})`
  };
}
