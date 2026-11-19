import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createRegistry } from '../src/services/ai/registry.js';

export const TEST_DB = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/ai_chat_test';

export async function connectTestDb() {
  await mongoose.connect(TEST_DB, { serverSelectionTimeoutMS: 4000 });
  await mongoose.connection.dropDatabase();
}

export async function disconnectTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    });
  });

/** Reads the tone label out of a system prompt ("Tone: Casual." -> "Casual"). */
export const toneOf = (call) => /Tone: (\w+)\./.exec(call.system)?.[1];

/**
 * A scripted provider adapter. Streams `reply` in small chunks and records
 * every call so tests can assert on the system prompt, messages, thinking level...
 */
export function createFakeAdapter({
  provider = 'fake',
  reply = (call) => `${toneOf(call)} answer from ${call.model} with ${call.thinking} thinking.`,
  chunkSize = 6,
  delayMs = 0,
  fail = null,
} = {}) {
  const calls = [];
  return {
    provider,
    providerLabel: 'Fake AI',
    calls,
    async *streamReply(call) {
      calls.push(call);
      if (fail) throw typeof fail === 'function' ? fail(call) : fail;
      const text = typeof reply === 'function' ? reply(call) : reply;
      for (let i = 0; i < text.length; i += chunkSize) {
        if (delayMs) await wait(delayMs, call.signal);
        if (call.signal?.aborted) throw abortError();
        yield { type: 'text', text: text.slice(i, i + chunkSize) };
      }
      yield { type: 'done', model: call.model, stopReason: 'end_turn' };
    },
  };
}

/**
 * App wired to two fake providers:
 *   primary:model-a, primary:model-a2  -> adapters.a
 *   compare:model-b                    -> adapters.b
 */
export function buildTestApp({ a, b } = {}) {
  const adapters = { a: a ?? createFakeAdapter(), b: b ?? createFakeAdapter({ provider: 'fake-b' }) };
  const registry = createRegistry([
    { key: 'primary', provider: 'fake', models: ['model-a', 'model-a2'], adapter: adapters.a },
    { key: 'compare', provider: 'fake-b', models: ['model-b'], adapter: adapters.b },
  ]);
  const app = createApp({ registry, serveClient: false, log: { error() {} } });
  return { app, registry, adapters };
}

export function parseSSE(text) {
  return text
    .split('\n\n')
    .map((block) => {
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter(Boolean);
}

const rawText = (res, callback) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => callback(null, data));
};

/** POST /api/chat and collect the SSE events (or the JSON error). */
export async function postChat(app, body) {
  const res = await request(app).post('/api/chat').send(body).buffer(true).parse(rawText);
  const isJson = String(res.headers['content-type']).includes('application/json');
  return {
    status: res.status,
    events: isJson ? [] : parseSSE(res.body),
    error: isJson ? JSON.parse(res.body).error : null,
  };
}

/** Sends a message and returns { conversationId, exchange } from the final event. */
export async function sendMessage(app, body) {
  const result = await postChat(app, body);
  const meta = result.events.find((e) => e.event === 'meta');
  const last = result.events.at(-1);
  return {
    ...result,
    conversationId: meta?.data.conversation._id,
    exchange: last?.data.exchange,
    text: result.events.filter((e) => e.event === 'delta').map((e) => e.data.text).join(''),
  };
}
