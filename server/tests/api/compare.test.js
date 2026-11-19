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

const compareBody = {
  message: 'Which database should I use?',
  tone: 'professional',
  thinking: 'deep',
  modelId: 'primary:model-a',
  compare: { modelId: 'compare:model-b', tone: 'casual' },
};

describe('Compare AI responses', () => {
  it('generates two answers in parallel and waits for the user to choose', async () => {
    const a = createFakeAdapter({ reply: 'Answer A '.repeat(6), chunkSize: 3, delayMs: 5 });
    const b = createFakeAdapter({ provider: 'fake-b', reply: 'Answer B '.repeat(6), chunkSize: 3, delayMs: 5 });
    const { app } = buildTestApp({ a, b });

    const result = await sendMessage(app, compareBody);
    const deltas = result.events.filter((e) => e.event === 'delta');
    const order = deltas.map((e) => e.data.candidate);

    // Both lanes stream, and they interleave: neither waits for the other to finish.
    expect(new Set(order)).toEqual(new Set([0, 1]));
    expect(order.indexOf(1)).toBeLessThan(order.lastIndexOf(0));
    expect(result.events.filter((e) => e.event === 'candidate')).toHaveLength(2);
    expect(result.events.at(-1).event).toBe('done');

    // Each side used its own model, tone, and the shared thinking level.
    expect([a.calls[0].model, toneOf(a.calls[0]), a.calls[0].thinking]).toEqual(['model-a', 'Professional', 'deep']);
    expect([b.calls[0].model, toneOf(b.calls[0]), b.calls[0].thinking]).toEqual(['model-b', 'Casual', 'deep']);

    const saved = (await Conversation.findById(result.conversationId).lean()).exchanges[0];
    expect(saved).toMatchObject({ mode: 'compare', status: 'choosing', response: '', selectedCandidate: null });
    expect(saved.candidates.map((c) => [c.label, c.modelId, c.tone, c.status])).toEqual([
      ['A', 'primary:model-a', 'professional', 'complete'],
      ['B', 'compare:model-b', 'casual', 'complete'],
    ]);
    expect(saved.candidates[0].response).toBe('Answer A '.repeat(6));
    expect(saved.candidates[1].response).toBe('Answer B '.repeat(6));
  });

  it('can compare two tones on the same model', async () => {
    const { app, adapters } = buildTestApp();
    await sendMessage(app, { message: 'Hi', tone: 'professional', compare: { tone: 'concise' } });
    expect(adapters.a.calls.map(toneOf).sort()).toEqual(['Concise', 'Professional']);
  });

  it('blocks new messages until an answer is chosen, then keeps the chosen one', async () => {
    const { app, adapters } = buildTestApp();
    const compared = await sendMessage(app, compareBody);
    const id = compared.conversationId;
    const exchangeId = compared.exchange._id;

    const blocked = await postChat(app, { conversationId: id, message: 'Next', tone: 'casual' });
    expect(blocked.status).toBe(409);
    expect(blocked.error).toMatch(/Choose one of the compared answers/);

    const choice = await request(app).post(`/api/conversations/${id}/exchanges/${exchangeId}/select`).send({ candidate: 1 });
    expect(choice.status).toBe(200);
    expect(choice.body.exchange).toMatchObject({
      status: 'complete',
      selectedCandidate: 1,
      tone: 'casual',
      modelId: 'compare:model-b',
      response: compared.exchange.candidates[1].response,
    });

    // The chosen answer becomes context for the next turn.
    await sendMessage(app, { conversationId: id, message: 'Next', tone: 'casual' });
    const lastCall = adapters.a.calls.at(-1);
    expect(lastCall.messages).toEqual([
      { role: 'user', content: compareBody.message },
      { role: 'assistant', content: compared.exchange.candidates[1].response },
      { role: 'user', content: 'Next' },
    ]);
  });

  it('keeps going when one side fails', async () => {
    const b = createFakeAdapter({ provider: 'fake-b', fail: Object.assign(new Error('down'), { status: 503 }) });
    const { app } = buildTestApp({ b });
    const result = await sendMessage(app, compareBody);

    expect(result.exchange.status).toBe('choosing');
    expect(result.exchange.candidates[0].status).toBe('complete');
    expect(result.exchange.candidates[1]).toMatchObject({ status: 'error', response: '' });
    expect(result.exchange.candidates[1].error).toMatch(/temporarily unavailable/);

    const pickEmpty = await request(app)
      .post(`/api/conversations/${result.conversationId}/exchanges/${result.exchange._id}/select`)
      .send({ candidate: 1 });
    expect(pickEmpty.status).toBe(400);
  });

  it('marks the exchange as an error when both sides fail', async () => {
    const fail = Object.assign(new Error('nope'), { status: 500 });
    const { app } = buildTestApp({ a: createFakeAdapter({ fail }), b: createFakeAdapter({ fail }) });
    const result = await sendMessage(app, compareBody);
    expect(result.events.at(-1).event).toBe('error');
    expect(result.exchange.status).toBe('error');
  });

  it('validates the selection request', async () => {
    const { app } = buildTestApp();
    const single = await sendMessage(app, { message: 'Hi', tone: 'casual' });
    const notCompare = await request(app)
      .post(`/api/conversations/${single.conversationId}/exchanges/${single.exchange._id}/select`)
      .send({ candidate: 0 });
    expect(notCompare.status).toBe(400);

    const compared = await sendMessage(app, compareBody);
    const outOfRange = await request(app)
      .post(`/api/conversations/${compared.conversationId}/exchanges/${compared.exchange._id}/select`)
      .send({ candidate: 5 });
    expect(outOfRange.status).toBe(400);
  });

  it('cannot be combined with rewrite', async () => {
    const { app } = buildTestApp();
    const res = await postChat(app, { ...compareBody, regenerateExchangeId: '64b000000000000000000000' });
    expect(res.status).toBe(400);
  });
});
