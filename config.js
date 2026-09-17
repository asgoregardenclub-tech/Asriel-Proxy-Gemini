/**
 * Asriel-Proxy-Gemini Configuration
 * Supports environment overrides with resilient defaults.
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

  // Default active model alias
  defaultModel: 'gemini-3.7-flash',

  // Upstream Google MODE_CATEGORY internal enumeration [79] & thinking depth [17]
  // 1=FAST, 2=THINKING, 3=PRO, 4=AUTO, 5=FAST_DYNAMIC_THINKING, 6=FLASH_LITE
  // Think modes: 0=deepest, 2=adaptive/medium, 4=shallow/off
  modelMappings: {
    'gemini-3.7-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.7 Flash - Optimal for fast high-context roleplay'
    },
    'gemini-3.6-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 3.6 Flash'
    },
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
      desc: 'Gemini 3.5 Flash Thinking (Extended Reasoning clamped to 5k)'
    },
    'gemini-3.5-flash-thinking-lite': {
      mode: 2,
      think: 2,
      isThinking: true,
      desc: 'Gemini 3.5 Flash Thinking Lite'
    },
    'gemini-2.5-flash': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Gemini 2.5 Flash'
    },
    'gemini-2.5-pro': {
      mode: 3,
      think: 0,
      isThinking: true,
      desc: 'Gemini 2.5 Pro'
    },
    'gemini-auto': {
      mode: 4,
      think: 4,
      isThinking: false,
      desc: 'Gemini Auto Adaptive Mode'
    },
    'gemini-flash-lite': {
      mode: 6,
      think: 4,
      isThinking: false,
      desc: 'Gemini Flash Lite - Lowest latency'
    },
    // OpenAI client aliases mapped to modern Flash
    'gpt-4o': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-4o Alias -> Gemini 3.7 Flash'
    },
    'gpt-4': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-4 Alias -> Gemini 3.7 Flash'
    },
    'gpt-3.5-turbo': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'OpenAI GPT-3.5 Alias -> Gemini 3.6 Flash'
    },
    'claude-3-5-sonnet': {
      mode: 1,
      think: 4,
      isThinking: false,
      desc: 'Claude 3.5 Sonnet Alias -> Gemini 3.7 Flash'
    }
  }
};
