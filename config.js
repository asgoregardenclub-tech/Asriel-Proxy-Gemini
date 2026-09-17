/**
 * config.js
 * Centralized Configuration & Comprehensive Google Gemini Model Directory.
 * Fully mapped for Gemini 3.8, 3.7, 3.6, 3.5, 3.1, 3.0, 2.5, 2.0, and 1.5.
 */

export const config = {
  // Network binding
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Request & upstream limits
  requestTimeoutMs: 180000, // 3 minutes
  retryAttempts: 3,
  retryDelayMs: 1500,

  // Thinking budget clamp (5,000 tokens maximum for reasoning variants)
  thinkingBudgetTokens: 5000,

  // Fallback build label (bl) used if frontend scrape fails
  geminiBl: process.env.GEMINI_BL || 'boq_assistant-bard-web-server_20260716.08_p0',

  // Session rotator constraints
  poolMinAlive: 2,
  poolMaxAlive: 8,
  sessionMaxAgeMs: 25 * 60 * 1000, // 25 minutes
  sessionMaxUses: 40,

  // Default browser identity
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',

  // Default active model
  defaultModel: 'gemini-3.8-flash',

  // =========================================================================
  // Upstream Google MODE_CATEGORY internal enumeration [79] & thinking depth [17]
  // 1=FAST/FLASH, 2=THINKING, 3=PRO, 4=AUTO, 6=FLASH_LITE
  // Think modes: 0=deepest reasoning, 2=adaptive/medium, 4=shallow/off
  // =========================================================================
  modelMappings: {
    // -----------------------------------------------------------------------
    // GEMINI 3.8 GENERATION (September 2026 Flagships)
    // -----------------------------------------------------------------------
    'gemini-3.8-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.8 Flash - Latest frontier high-speed workhorse'
    },
    'gemini-3.8-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.8 Flash Thinking (Extended deep reasoning clamped to 5k)'
    },
    'gemini-3.8-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.8 Deep Thinking Variant'
    },
    'gemini-3.8-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.8 Pro - Flagship complex reasoning'
    },

    // -----------------------------------------------------------------------
    // GEMINI 3.7 GENERATION
    // -----------------------------------------------------------------------
    'gemini-3.7-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.7 Flash - High-context everyday driver'
    },
    'gemini-3.7-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.7 Flash Thinking'
    },
    'gemini-3.7-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.7 Pro'
    },

    // -----------------------------------------------------------------------
    // GEMINI 3.6 GENERATION
    // -----------------------------------------------------------------------
    'gemini-3.6-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.6 Flash'
    },
    'gemini-3.6-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.6 Flash Thinking'
    },

    // -----------------------------------------------------------------------
    // GEMINI 3.5 GENERATION
    // -----------------------------------------------------------------------
    'gemini-3.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.5 Flash'
    },
    'gemini-3.5-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.5 Flash Thinking'
    },
    'gemini-3.5-flash-thinking-lite': {
      mode: 2,
      think: 2,
      isThinking: true,
      desc: 'Gemini 3.5 Flash Thinking Lite'
    },
    'gemini-3.5-flash-lite': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.5 Flash Lite - Ultra-low latency'
    },
    'gemini-3.5-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.5 Pro'
    },

    // -----------------------------------------------------------------------
    // GEMINI 3.1 & 3.0 GENERATION
    // -----------------------------------------------------------------------
    'gemini-3.1-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.1 Pro'
    },
    'gemini-3.1-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.1 Flash'
    },
    'gemini-3.1-flash-lite': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.1 Flash Lite'
    },
    'gemini-3.1-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3.1 Flash Thinking'
    },
    'gemini-3-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3 Flash'
    },
    'gemini-3-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3 Pro'
    },
    'gemini-3-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 3 Flash Thinking'
    },

    // -----------------------------------------------------------------------
    // GEMINI 2.5 GENERATION
    // -----------------------------------------------------------------------
    'gemini-2.5-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.5 Pro - Reasoning and deep analysis'
    },
    'gemini-2.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 2.5 Flash'
    },
    'gemini-2.5-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.5 Flash Thinking'
    },
    'gemini-2.5-flash-lite': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini 2.5 Flash Lite'
    },
    'gemini-2.5-deep-think': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.5 Deep Think'
    },

    // -----------------------------------------------------------------------
    // GEMINI 2.0 GENERATION
    // -----------------------------------------------------------------------
    'gemini-2.0-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 2.0 Flash'
    },
    'gemini-2.0-flash-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.0 Flash Thinking'
    },
    'gemini-2.0-flash-thinking-exp': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.0 Flash Thinking Experimental'
    },
    'gemini-2.0-flash-lite': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini 2.0 Flash Lite'
    },
    'gemini-2.0-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.0 Pro'
    },
    'gemini-2.0-pro-exp': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.0 Pro Experimental'
    },

    // -----------------------------------------------------------------------
    // GEMINI 1.5 LEGACY
    // -----------------------------------------------------------------------
    'gemini-1.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 1.5 Flash'
    },
    'gemini-1.5-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 1.5 Pro'
    },
    'gemini-1.5-flash-8b': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini 1.5 Flash 8B'
    },

    // -----------------------------------------------------------------------
    // GENERIC & ADAPTIVE SHORTCUTS
    // -----------------------------------------------------------------------
    'gemini-auto': {
      mode: 4,
      think: 4,
      isThinking: false,
      desc: 'Gemini Auto Adaptive Mode'
    },
    'gemini-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini Flash (Points to current 3.8 Flash)'
    },
    'gemini-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini Pro (Points to current 3.8 Pro)'
    },
    'gemini-thinking': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'Gemini Thinking (Points to current 3.8 Thinking)'
    },
    'gemini-flash-lite': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini Flash Lite'
    },

    // -----------------------------------------------------------------------
    // OPENAI & CLAUDE FRONTEND ALIASES
    // -----------------------------------------------------------------------
    'gpt-4o': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-4o Alias -> Gemini 3.8 Flash'
    },
    'gpt-4o-mini': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-4o-mini Alias -> Gemini 3.5 Flash Lite'
    },
    'gpt-4': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-4 Alias -> Gemini 3.8 Flash'
    },
    'gpt-4-turbo': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-4 Turbo Alias -> Gemini 3.8 Flash'
    },
    'gpt-3.5-turbo': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-3.5 Turbo Alias -> Gemini 3.1 Flash Lite'
    },
    'o1': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'OpenAI o1 Reasoning Alias -> Gemini 3.8 Flash Thinking'
    },
    'o3-mini': {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: 'OpenAI o3-mini Reasoning Alias -> Gemini 3.8 Flash Thinking'
    },
    'claude-3-7-sonnet': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Claude 3.7 Sonnet Alias -> Gemini 3.8 Flash'
    },
    'claude-3-5-sonnet': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Claude 3.5 Sonnet Alias -> Gemini 3.8 Flash'
    },
    'claude-3-5-haiku': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Claude 3.5 Haiku Alias -> Gemini 3.5 Flash Lite'
    }
  }
};

/**
 * Universal Auto-Resolver:
 * First checks explicit mappings above. If an unknown model string is passed,
 * it inspects keywords to select the correct Google mode automatically.
 */
export function resolveModel(modelName = '') {
  const name = String(modelName).trim().toLowerCase();

  // 1. Direct match in dictionary
  if (config.modelMappings[name]) {
    return config.modelMappings[name];
  }

  // 2. Keyword deduction for future or unlisted models
  if (name.includes('thinking') || name.includes('reason') || name.includes('deep')) {
    return {
      mode: 2,
      think: 0,
      isThinking: true,
      desc: `Auto-configured Thinking Engine (${modelName})`
    };
  }

  if (name.includes('pro') || name.includes('ultra')) {
    return {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: `Auto-configured Pro Engine (${modelName})`
    };
  }

  if (name.includes('lite') || name.includes('mini') || name.includes('nano') || name.includes('8b')) {
    return {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: `Auto-configured Flash Lite Engine (${modelName})`
    };
  }

  // 3. Fallback to default
  return config.modelMappings[config.defaultModel];
}
