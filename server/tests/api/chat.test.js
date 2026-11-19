import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conversation } from '../../src/models/Conversation.js';
import {
  buildTestApp,
  clearDb,
  connectTestDb,
  createFakeAdapter,
  disconnectTestDb,
  postChat,
  sendMessage,
  toneOf,
} from '../helpers.js';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearDb);

describe('GET /api/health', () => {
  it('lists the configured models, tones and thinking levels', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.models.map((m) => m.id)).toEqual(['primary:model-a', 'primary:model-a2', 'compare:model-b']);
    expect(res.body.defaultModelId).toBe('primary:model-a');
    expect(res.body.thinkingLevels.map((t) => t.id)).toEqual(['fast', 'balanced', 'deep']);
    expect(res.body.tones.map((t) => t.id)).toEqual(['professional', 'casual', 'concise']);
    expect(res.body.demo).toBe(false);
  });
});

describe('POST /api/chat validation', () => {
  const { app } = buildTestApp();
  it.each([
    [{ message: '', tone: 'casual' }, /cannot be empty/],
    [{ message: 'hi', tone: 'pirate' }, /Tone must be one of/],
    [{ message: 'hi', tone: 'casual', thinking: 'ultra' }, /Thinking level must be one of/],
    [{ message: 'hi', tone: 'casual', modelId: 'primary:nope' }, /Unknown model/],
    [{ message: 'hi', tone: 'casual', compare: { tone: 'loud' } }, /Compare tone must be one of/],
    [{ message: 'x'.repeat(8001), tone: 'casual' }, /up to 8000 characters/],
  ])('rejects %j', async (body, pattern) => {
    const res = await postChat(app, body);
    expect(res.status).toBe(400);
    expect(res.error).toMatch(pattern);
  });

  it('returns 404 for an unknown conversation', async () => {
    const res = await postChat(app, { conversationId: '64b000000000000000000000', message: 'hi', tone: 'casual' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/chat streaming', () => {
  it('streams meta, deltas and done, then saves prompt, response and timestamp', async () => {
    const { app } = buildTestApp();
    const result = await sendMessage(app, { message: 'Hello there', tone: 'casual', thinking: 'deep' });

    expect(result.events[0].event).toBe('meta');
    expect(result.events.filter((e) => e.event === 'delta').length).toBeGreaterThan(1);
    expect(result.events.at(-1).event).toBe('done');
    expect(result.text).toBe('Casual answer from model-a with deep thinking.');

    const saved = await Conversation.findById(result.conversationId).lean();
    expect(saved.title).toBe('Hello there');
    expect(saved.exchanges).toHaveLength(1);
    expect(saved.exchanges[0]).toMatchObject({
      prompt: 'Hello there',
      response: result.text,
      tone: 'casual',
      thinking: 'deep',
      status: 'complete',
      mode: 'single',
      modelId: 'primary:model-a',
      model: 'model-a',
    });
    expect(saved.exchanges[0].timestamp).toBeInstanceOf(Date);
    expect(saved.exchanges[0].completedAt).toBeInstanceOf(Date);
  });

  it('sends the tone as a system instruction and the thinking level to the provider', async () => {
    const { app, adapters } = buildTestApp();
    await sendMessage(app, { message: 'Hi', tone: 'concise', thinking: 'fast' });
    const [call] = adapters.a.calls;
    expect(toneOf(call)).toBe('Concise');
    expect(call.system).toContain('<tone_instruction>');
    expect(call.thinking).toBe('fast');
    expect(call.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('defaults the thinking level to balanced', async () => {
    const { app, adapters } = buildTestApp();
    await sendMessage(app, { message: 'Hi', tone: 'casual' });
    expect(adapters.a.calls[0].thinking).toBe('balanced');
  });

  it('switches tone per message within one conversation', async () => {
    const { app, adapters } = buildTestApp();
    const first = await sendMessage(app, { message: 'One', tone: 'professional' });
    await sendMessage(app, { conversationId: first.conversationId, message: 'Two', tone: 'casual' });

    expect(adapters.a.calls.map(toneOf)).toEqual(['Professional', 'Casual']);
    const saved = await Conversation.findById(first.conversationId).lean();
    expect(saved.exchanges.map((e) => e.tone)).toEqual(['professional', 'casual']);
  });

  it('routes the request to the selected model', async () => {
    const { app, adapters } = buildTestApp();
    const result = await sendMessage(app, { message: 'Hi', tone: 'casual', modelId: 'compare:model-b' });
    expect(adapters.a.calls).toHaveLength(0);
    expect(adapters.b.calls[0].model).toBe('model-b');
    expect(result.exchange.modelId).toBe('compare:model-b');
  });

  it('sends earlier turns as context', async () => {
    const { app, adapters } = buildTestApp();
    const first = await sendMessage(app, { message: 'First question', tone: 'casual' });
    await sendMessage(app, { conversationId: first.conversationId, message: 'Follow-up', tone: 'casual' });
    expect(adapters.a.calls[1].messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: first.text },
      { role: 'user', content: 'Follow-up' },
    ]);
  });

  it('rewrites only the latest reply', async () => {
    const { app } = buildTestApp();
    const first = await sendMessage(app, { message: 'Q1', tone: 'casual' });
    const second = await sendMessage(app, { conversationId: first.conversationId, message: 'Q2', tone: 'casual' });

    const rewritten = await sendMessage(app, {
      conversationId: first.conversationId,
      message: 'Q2',
      tone: 'concise',
      regenerateExchangeId: second.exchange._id,
    });
    expect(rewritten.status).toBe(200);
    const saved = await Conversation.findById(first.conversationId).lean();
    expect(saved.exchanges.map((e) => [e.prompt, e.tone])).toEqual([
      ['Q1', 'casual'],
      ['Q2', 'concise'],
    ]);

    const stale = await postChat(app, {
      conversationId: first.conversationId,
      message: 'Q1',
      tone: 'casual',
      regenerateExchangeId: first.exchange._id,
    });
    expect(stale.status).toBe(409);
  });

  it('reports provider errors and keeps them out of later context', async () => {
    const failing = createFakeAdapter({ fail: Object.assign(new Error('bad key'), { status: 401 }) });
    const { app: failingApp } = buildTestApp({ a: failing });
    const failed = await sendMessage(failingApp, { message: 'Hi', tone: 'casual' });

    const errorEvent = failed.events.at(-1);
    expect(errorEvent.event).toBe('error');
    expect(errorEvent.data.message).toMatch(/Fake AI rejected the API key/);
    const saved = await Conversation.findById(failed.conversationId).lean();
    expect(saved.exchanges[0]).toMatchObject({ status: 'error', response: '' });

    const { app, adapters } = buildTestApp();
    await sendMessage(app, { conversationId: failed.conversationId, message: 'Again', tone: 'casual' });
    expect(adapters.a.calls[0].messages).toEqual([{ role: 'user', content: 'Again' }]);
  });

  it('saves a partial reply as "stopped" when the client disconnects', async () => {
    const slow = createFakeAdapter({ reply: 'word '.repeat(200), chunkSize: 5, delayMs: 15 });
    const { app } = buildTestApp({ a: slow });
    const server = app.listen(0);
    const { port } = server.address();

    try {
      const controller = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Long story', tone: 'casual' }),
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let seen = '';
      while (!seen.includes('event: delta')) seen += decoder.decode((await reader.read()).value);
      const conversationId = /"conversation":\{"_id":"([a-f0-9]{24})"/.exec(seen)[1];
      controller.abort();

      let exchange;
      for (let i = 0; i < 50; i++) {
        exchange = (await Conversation.findById(conversationId).lean()).exchanges[0];
        if (exchange.status !== 'streaming') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(exchange.status).toBe('stopped');
      expect(exchange.response.length).toBeGreaterThan(0);
      expect(exchange.response.length).toBeLessThan(1000);
    } finally {
      server.close();
    }
  });
});
