import { vi } from 'vitest';

const encoder = new TextEncoder();

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** An SSE response whose events arrive as separate chunks (one split mid-event). */
export function sseResponse(events) {
  const text = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  const middle = Math.floor(text.length / 2);
  const chunks = [text.slice(0, middle), text.slice(middle)];
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

export const MODELS = [
  { id: 'primary:claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'claude', providerLabel: 'Anthropic', connection: 'primary', demo: false },
  { id: 'compare:gpt-5-mini', label: 'gpt-5-mini', provider: 'openai', providerLabel: 'OpenAI', connection: 'compare', demo: false },
];

export const HEALTH = {
  status: 'ok',
  database: 'connected',
  demo: false,
  models: MODELS,
  defaultModelId: MODELS[0].id,
};

export const exchangeFixture = (overrides = {}) => ({
  _id: 'e1',
  prompt: 'Hello',
  response: 'Hi there!',
  tone: 'professional',
  thinking: 'balanced',
  status: 'complete',
  mode: 'single',
  candidates: null,
  selectedCandidate: null,
  modelId: MODELS[0].id,
  model: 'claude-opus-5-5',
  stopReason: 'end_turn',
  error: null,
  timestamp: '2026-11-19T10:00:00.000Z',
  completedAt: '2026-11-19T10:00:05.000Z',
  ...overrides,
});

/**
 * Installs a fetch mock. `routes` maps "METHOD /path" to a function
 * (request body, url) => Response | object. Unmatched requests fail the test.
 */
export function mockFetch(routes) {
  const calls = [];
  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = (options.method ?? 'GET').toUpperCase();
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path, body, url: String(url) });
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unexpected request: ${method} ${path}`);
    const result = await handler(body, String(url));
    if (result instanceof Response) return result;
    if (result === null) return new Response(null, { status: 204 });
    return jsonResponse(result ?? {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

export { jsonResponse };
