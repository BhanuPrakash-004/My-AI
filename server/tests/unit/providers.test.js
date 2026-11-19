import { describe, expect, it } from 'vitest';
import { createClaudeProvider } from '../../src/services/ai/claude.js';
import { describeProviderError } from '../../src/services/ai/errors.js';
import { createMockProvider } from '../../src/services/ai/mock.js';
import { createOpenAIProvider } from '../../src/services/ai/openai.js';
import { createRegistry, formatModelLabel } from '../../src/services/ai/registry.js';
import { buildSystemPrompt } from '../../src/services/tones.js';

const collect = async (iterable) => {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
};

const apiError = (status, message) => Object.assign(new Error(message), { status });

/** Stand-in for client.beta.messages.stream(): scripted events + finalMessage(). */
function fakeAnthropicClient(scripts) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        stream(params, options) {
          calls.push({ params, options });
          const script = scripts[Math.min(calls.length - 1, scripts.length - 1)];
          return {
            async *[Symbol.asyncIterator]() {
              if (script.failBeforeOutput) throw script.failBeforeOutput;
              for (const text of script.texts ?? []) {
                yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
              }
              if (script.failAfterOutput) throw script.failAfterOutput;
            },
            finalMessage: async () => ({ model: params.model, stop_reason: script.stopReason ?? 'end_turn' }),
          };
        },
      },
    },
  };
}

/** Stand-in for client.chat.completions.create({ stream: true }). */
function fakeOpenAIClient(scripts) {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        async create(params, options) {
          calls.push({ params, options });
          const script = scripts[Math.min(calls.length - 1, scripts.length - 1)];
          if (script.reject) throw script.reject;
          return (async function* () {
            for (const text of script.texts) {
              yield { model: script.model ?? params.model, choices: [{ delta: { content: text }, finish_reason: null }] };
            }
            yield { model: script.model ?? params.model, choices: [{ delta: {}, finish_reason: script.finish ?? 'stop' }] };
          })();
        },
      },
    },
  };
}

const request = {
  model: 'test-model',
  system: buildSystemPrompt('casual'),
  messages: [{ role: 'user', content: 'Hi' }],
  thinking: 'deep',
};

describe('Claude provider', () => {
  it('streams text and passes tone, history and thinking level to the API', async () => {
    const client = fakeAnthropicClient([{ texts: ['Hel', 'lo'] }]);
    const signal = new AbortController().signal;
    const provider = createClaudeProvider({ client, maxTokens: 1234 });

    const events = await collect(provider.streamReply({ ...request, signal }));

    expect(events).toEqual([
      { type: 'text', text: 'Hel' },
      { type: 'text', text: 'lo' },
      { type: 'done', model: 'test-model', stopReason: 'end_turn' },
    ]);
    const { params, options } = client.calls[0];
    expect(params).toMatchObject({
      model: 'test-model',
      max_tokens: 1234,
      system: request.system,
      messages: request.messages,
      output_config: { effort: 'high' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
    });
    expect(options.signal).toBe(signal);
  });

  it.each([
    ['fast', 'low'],
    ['balanced', 'medium'],
    ['deep', 'high'],
  ])('maps thinking level %s to effort %s', async (thinking, effort) => {
    const client = fakeAnthropicClient([{ texts: ['ok'] }]);
    await collect(createClaudeProvider({ client }).streamReply({ ...request, thinking }));
    expect(client.calls[0].params.output_config).toEqual({ effort });
  });

  it('omits the fallback beta when disabled', async () => {
    const client = fakeAnthropicClient([{ texts: ['ok'] }]);
    await collect(createClaudeProvider({ client, fallbacks: false }).streamReply(request));
    expect(client.calls[0].params.betas).toBeUndefined();
    expect(client.calls[0].params.fallbacks).toBeUndefined();
  });

  it('retries without effort when a model rejects it, and remembers that', async () => {
    const client = fakeAnthropicClient([
      { failBeforeOutput: apiError(400, 'output_config.effort: not supported for this model') },
      { texts: ['fine'] },
    ]);
    const provider = createClaudeProvider({ client });

    const events = await collect(provider.streamReply(request));
    expect(events.map((e) => e.type)).toEqual(['text', 'done']);
    expect(client.calls[0].params.output_config).toBeDefined();
    expect(client.calls[1].params.output_config).toBeUndefined();

    await collect(provider.streamReply(request));
    expect(client.calls[2].params.output_config).toBeUndefined();
  });

  it('retries without fallbacks when they are rejected', async () => {
    const client = fakeAnthropicClient([
      { failBeforeOutput: apiError(400, 'fallbacks: not available for this model') },
      { texts: ['ok'] },
    ]);
    await collect(createClaudeProvider({ client }).streamReply(request));
    expect(client.calls[1].params.fallbacks).toBeUndefined();
    expect(client.calls[1].params.output_config).toEqual({ effort: 'high' });
  });

  it('does not retry once text has streamed', async () => {
    const client = fakeAnthropicClient([{ texts: ['partial'], failAfterOutput: apiError(400, 'effort') }]);
    await expect(collect(createClaudeProvider({ client }).streamReply(request))).rejects.toThrow('effort');
    expect(client.calls).toHaveLength(1);
  });

  it('rethrows other errors', async () => {
    const client = fakeAnthropicClient([{ failBeforeOutput: apiError(401, 'invalid x-api-key') }]);
    await expect(collect(createClaudeProvider({ client }).streamReply(request))).rejects.toMatchObject({ status: 401 });
  });
});

describe('OpenAI provider', () => {
  it('sends the system prompt first and maps thinking to reasoning_effort', async () => {
    const client = fakeOpenAIClient([{ texts: ['Hi', ' there'] }]);
    const events = await collect(createOpenAIProvider({ client }).streamReply(request));

    expect(events).toEqual([
      { type: 'text', text: 'Hi' },
      { type: 'text', text: ' there' },
      { type: 'done', model: 'test-model', stopReason: 'end_turn' },
    ]);
    const { params } = client.calls[0];
    expect(params.stream).toBe(true);
    expect(params.reasoning_effort).toBe('high');
    expect(params.messages[0]).toEqual({ role: 'system', content: request.system });
    expect(params.messages.slice(1)).toEqual(request.messages);
  });

  it('maps finish reasons onto stop reasons', async () => {
    const client = fakeOpenAIClient([{ texts: ['cut'], finish: 'length' }]);
    const events = await collect(createOpenAIProvider({ client }).streamReply(request));
    expect(events.at(-1).stopReason).toBe('max_tokens');
  });

  it('retries without reasoning_effort for models that do not support it', async () => {
    const client = fakeOpenAIClient([
      { reject: apiError(400, "Unsupported parameter: 'reasoning_effort' is not supported with this model.") },
      { texts: ['ok'] },
    ]);
    const provider = createOpenAIProvider({ client });
    await collect(provider.streamReply(request));
    expect(client.calls[1].params.reasoning_effort).toBeUndefined();

    await collect(provider.streamReply(request));
    expect(client.calls[2].params.reasoning_effort).toBeUndefined();
  });

  it('rethrows unrelated API errors', async () => {
    const client = fakeOpenAIClient([{ reject: apiError(404, 'model not found') }]);
    await expect(collect(createOpenAIProvider({ client }).streamReply(request))).rejects.toMatchObject({ status: 404 });
    expect(client.calls).toHaveLength(1);
  });
});

describe('mock provider', () => {
  it('streams a sample reply in the requested tone', async () => {
    const provider = createMockProvider({ chunkDelayMs: 0, jitterMs: 0, firstTokenDelayMs: 0 });
    const events = await collect(provider.streamReply({ ...request, system: buildSystemPrompt('concise') }));
    const text = events.filter((e) => e.type === 'text').map((e) => e.text).join('');
    expect(text).toMatch(/^Demo mode \(Deep\)/);
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'demo' });
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = createMockProvider({ firstTokenDelayMs: 10 });
    await expect(collect(provider.streamReply({ ...request, signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('describeProviderError', () => {
  const ctx = { providerLabel: 'OpenAI', model: 'gpt-x' };
  it.each([
    [401, /rejected the API key.*AI_API_KEY/],
    [403, /does not have access to "gpt-x"/],
    [404, /"gpt-x" was not found.*AI_MODEL/],
    [429, /rate limiting/],
    [400, /rejected the request: bad/],
    [503, /temporarily unavailable/],
  ])('explains HTTP %i', (status, pattern) => {
    expect(describeProviderError(apiError(status, 'bad'), ctx)).toMatch(pattern);
  });

  it('explains connection errors', () => {
    const error = Object.assign(new Error('fetch failed'), { name: 'APIConnectionError' });
    expect(describeProviderError(error, ctx)).toMatch(/Could not reach OpenAI/);
  });
});

describe('model registry', () => {
  const adapter = (provider) => ({ provider, providerLabel: provider, streamReply: async function* () {} });

  it('lists every model with a stable id and readable label', () => {
    const registry = createRegistry([
      { key: 'primary', models: ['claude-opus-5-5', 'claude-sonnet-5-5'], adapter: adapter('claude') },
      { key: 'compare', models: ['gpt-5-mini'], adapter: adapter('openai') },
    ]);
    expect(registry.list().map((m) => [m.id, m.label])).toEqual([
      ['primary:claude-opus-5-5', 'Claude Opus 5.5'],
      ['primary:claude-sonnet-5-5', 'Claude Sonnet 5.5'],
      ['compare:gpt-5-mini', 'gpt-5-mini'],
    ]);
    expect(registry.list()[0]).not.toHaveProperty('adapter');
    expect(registry.isDemo()).toBe(false);
  });

  it('resolves the default and rejects unknown ids', () => {
    const registry = createRegistry([{ key: 'primary', models: ['m1'], adapter: adapter('openai') }]);
    expect(registry.resolve(undefined).id).toBe('primary:m1');
    expect(registry.resolve('primary:m1').model).toBe('m1');
    expect(registry.resolve('primary:nope')).toBeNull();
  });

  it('reports demo mode', () => {
    const registry = createRegistry([{ key: 'primary', provider: 'mock', models: ['demo'], demoReason: 'no key' }]);
    expect(registry.isDemo()).toBe(true);
    expect(registry.list()[0]).toMatchObject({ label: 'Demo model', demoReason: 'no key' });
  });

  it('formats Claude model ids', () => {
    expect(formatModelLabel('claude', 'claude-haiku-4-5')).toBe('Claude Haiku 4.5');
    expect(formatModelLabel('openai', 'gpt-5')).toBe('gpt-5');
  });
});
