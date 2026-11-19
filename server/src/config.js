import 'dotenv/config';

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const hasAnthropicCredentials = Boolean(
  process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
);

const requestedProvider = process.env.TIMBRE_PROVIDER?.trim().toLowerCase();

let provider;
if (requestedProvider === 'mock') provider = 'mock';
else if (requestedProvider === 'claude') provider = 'claude';
else provider = hasAnthropicCredentials ? 'claude' : 'mock';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/timbre',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
  provider,
  hasAnthropicCredentials,
  claude: {
    model: process.env.TIMBRE_MODEL?.trim() || 'claude-opus-5-5',
    effort: process.env.TIMBRE_EFFORT?.trim() || 'low',
    maxTokens: Number(process.env.TIMBRE_MAX_TOKENS) || 64000,
    fallbacks: bool(process.env.TIMBRE_FALLBACKS, true),
  },
  limits: {
    maxPromptChars: 8000,
    maxTitleChars: 120,
  },
};
