import { createClaudeProvider } from './claude.js';
import { describeProviderError } from './errors.js';
import { createMockProvider } from './mock.js';
import { createOpenAIProvider } from './openai.js';

/** "claude-opus-5-5" -> "Claude Opus 5.5"; other ids are shown as-is. */
export function formatModelLabel(provider, model) {
  if (provider === 'mock') return 'Demo model';
  if (!model.startsWith('claude-')) return model;
  const parts = model.replace(/^claude-/, '').split('-');
  const words = parts.filter((p) => Number.isNaN(Number(p)));
  const version = parts.filter((p) => !Number.isNaN(Number(p))).join('.');
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  return `Claude ${name}${version ? ` ${version}` : ''}`;
}

function createAdapter(connection, options) {
  if (connection.adapter) return connection.adapter; // injected (tests)
  if (connection.provider === 'claude') {
    return createClaudeProvider({
      apiKey: connection.apiKey,
      authToken: connection.authToken,
      baseURL: connection.baseURL,
      maxTokens: options.claude?.maxTokens,
      fallbacks: options.claude?.fallbacks,
    });
  }
  if (connection.provider === 'openai') {
    return createOpenAIProvider({ apiKey: connection.apiKey, baseURL: connection.baseURL });
  }
  return createMockProvider(options.mock);
}

/**
 * The set of models the app can call. Each model id is "<connection>:<model>",
 * for example "primary:claude-opus-5-5" or "compare:gpt-5-mini".
 */
export function createRegistry(connections, options = {}) {
  const entries = [];
  for (const connection of connections) {
    const adapter = createAdapter(connection, options);
    for (const model of connection.models) {
      entries.push({
        id: `${connection.key}:${model}`,
        connection: connection.key,
        provider: adapter.provider,
        providerLabel: adapter.providerLabel,
        model,
        label: formatModelLabel(adapter.provider, model),
        demo: adapter.provider === 'mock',
        demoReason: connection.demoReason ?? null,
        adapter,
      });
    }
  }

  const toPublic = ({ adapter: _adapter, ...entry }) => entry;

  return {
    list: () => entries.map(toPublic),
    defaultEntry: entries[0],
    resolve: (id) => (id ? entries.find((entry) => entry.id === id) ?? null : entries[0]),
    isDemo: () => entries.every((entry) => entry.demo),
    describeError: (error, entry) =>
      describeProviderError(error, { providerLabel: entry.providerLabel, model: entry.model }),
  };
}
