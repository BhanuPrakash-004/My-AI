import dotenv from 'dotenv';

// Loads server/.env. Variables already set in the environment take priority,
// which is what hosting platforms (and tests) rely on.
dotenv.config({ quiet: true });

const PROVIDER_ALIASES = {
  claude: 'claude',
  anthropic: 'claude',
  openai: 'openai',
  mock: 'mock',
  demo: 'mock',
};

export const DEFAULT_MODELS = {
  claude: 'claude-opus-5-5',
  openai: 'gpt-5-mini',
  mock: 'demo',
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const bool = (value, fallback) => {
  const v = clean(value).toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
};

const list = (value) =>
  clean(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Builds one provider connection from a set of prefixed variables, e.g.
 * AI_PROVIDER / AI_API_KEY / AI_BASE_URL / AI_MODEL / AI_MODELS.
 */
export function readConnection(env, prefix, key) {
  const rawProvider = clean(env[`${prefix}_PROVIDER`]).toLowerCase();
  let apiKey = clean(env[`${prefix}_API_KEY`]);
  const baseURL = clean(env[`${prefix}_BASE_URL`]) || null;

  let provider = PROVIDER_ALIASES[rawProvider];
  if (rawProvider && !provider) {
    throw new Error(`${prefix}_PROVIDER must be "claude" or "openai" (got "${rawProvider}").`);
  }

  // No explicit provider: infer it from whichever vendor key is present.
  if (!provider) {
    if (prefix !== 'AI') return null; // the compare connection is opt-in
    if (!apiKey && clean(env.OPENAI_API_KEY) && !clean(env.ANTHROPIC_API_KEY)) provider = 'openai';
    else provider = 'claude';
  }

  // Fall back to the vendor's own variable name for convenience.
  if (!apiKey && provider === 'claude') apiKey = clean(env.ANTHROPIC_API_KEY);
  if (!apiKey && provider === 'openai') apiKey = clean(env.OPENAI_API_KEY);
  const authToken = provider === 'claude' ? clean(env.ANTHROPIC_AUTH_TOKEN) : '';

  let demoReason = null;
  if (provider === 'mock') demoReason = `${prefix}_PROVIDER is set to mock.`;
  else if (provider === 'claude' && !apiKey && !authToken) demoReason = `${prefix}_API_KEY is empty.`;
  // OpenAI-compatible local servers (Ollama, LM Studio) often need no key.
  else if (provider === 'openai' && !apiKey && !baseURL) demoReason = `${prefix}_API_KEY is empty.`;

  if (demoReason) {
    return { key, provider: 'mock', requestedProvider: provider, apiKey: '', baseURL: null, models: ['demo'], demoReason };
  }

  const primaryModel = clean(env[`${prefix}_MODEL`]) || DEFAULT_MODELS[provider];
  const models = [...new Set([primaryModel, ...list(env[`${prefix}_MODELS`])])];

  return { key, provider, requestedProvider: provider, apiKey, authToken, baseURL, models, demoReason: null };
}

export function loadConfig(env = process.env) {
  const primary = readConnection(env, 'AI', 'primary');
  const compare = readConnection(env, 'COMPARE', 'compare');

  return {
    port: Number(env.PORT) || 5000,
    mongoUri: clean(env.MONGODB_URI) || 'mongodb://127.0.0.1:27017/Ai_Chat',
    clientOrigin: clean(env.CLIENT_ORIGIN) || 'http://localhost:5173',
    connections: compare ? [primary, compare] : [primary],
    claude: {
      maxTokens: Number(env.AI_MAX_TOKENS) || 64000,
      fallbacks: bool(env.AI_FALLBACKS, true),
    },
    limits: {
      maxPromptChars: 8000,
      maxTitleChars: 120,
      maxInstructionChars: 2000,
    },
  };
}

export const config = loadConfig();
