/**
 * config.js
 * Centralized Configuration & Comprehensive Google Gemini Model Directory.
 * Fully aligned to Gemini 3.8 Flagship Generation.
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

  // Latest released flagship model
  defaultModel: 'gemini-3.8-flash',

  modelMappings: {
    // -----------------------------------------------------------------------
    // GEMINI 3.8 FLAGSHIP SERIES (Latest Released Models)
    // -----------------------------------------------------------------------
    'gemini-3.8-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'Gemini 3.8 Flash' },
    'gemini-3.8-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.8-flash', desc: 'Gemini 3.8 Flash Thinking' },
    'gemini-3.8-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.8-flash', desc: 'Gemini 3.8 Thinking' },
    'gemini-3.8-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-3.8-pro', desc: 'Gemini 3.8 Pro' },

    // -----------------------------------------------------------------------
    // GEMINI 3.7 SERIES
    // -----------------------------------------------------------------------
    'gemini-3.7-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.7-flash', desc: 'Gemini 3.7 Flash' },
    'gemini-3.7-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.7-flash', desc: 'Gemini 3.7 Flash Thinking' },
    'gemini-3.7-pro': { mode: 3, think: 0, isThinking: true, studioId: 'gemini-3.7-pro', desc: 'Gemini 3.7 Pro' },

    // -----------------------------------------------------------------------
    // GEMINI 3.6 SERIES
    // -----------------------------------------------------------------------
    'gemini-3.6-flash': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.6-flash', desc: 'Gemini 3.6 Flash' },
    'gemini-3.6-flash-thinking': { mode: 2, think: 0, isThinking: true, studioId: 'gemini-3.6-flash', desc: 'Gemini 3.6 Flash Thinking' },

    // -----------------------------------------------------------------------
    // OPENAI ALIASES -> Route directly to Gemini 3.8 Flash
    // -----------------------------------------------------------------------
    'gpt-4o': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-4o -> Gemini 3.8 Flash' },
    'gpt-4o-mini': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-4o Mini -> Gemini 3.8 Flash' },
    'gpt-4': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-4 -> Gemini 3.8 Flash' },
    'gpt-3.5-turbo': { mode: 1, think: 4, isThinking: false, studioId: 'gemini-3.8-flash', desc: 'GPT-3.5 Turbo -> Gemini 3.8 Flash' }
  }
};

export function resolveModel(modelName = '') {
  const name = String(modelName).trim().toLowerCase();

  // 1. Direct dictionary match
  if (config.modelMappings[name]) {
    return { ...config.modelMappings[name], id: name };
  }

  // 2. If it's a thinking variant, map to 3.8-flash with thinking enabled
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

  // 3. If it's pro, map to 3.8-pro
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

  // 4. Any other custom string defaults directly to Gemini 3.8 Flash
  return {
    id: name,
    mode: 1,
    think: 4,
    isThinking: false,
    studioId: 'gemini-3.8-flash',
    desc: `Auto-configured Flash (${modelName})`
  };
}
