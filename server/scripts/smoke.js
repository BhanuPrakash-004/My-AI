// End-to-end smoke test against a running server.
// Usage: npm run smoke  (server must be running; BASE_URL defaults to http://localhost:5000)

const BASE = process.env.BASE_URL || 'http://localhost:5000';

let failures = 0;
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!condition) failures += 1;
};

async function json(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body };
}

async function chat(body) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { status: res.status, body: await res.json() };

  const events = [];
  let firstDeltaAt = null;
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const name = raw.match(/^event: (.+)$/m)?.[1];
      const data = raw.match(/^data: (.+)$/m)?.[1];
      if (!name || !data) continue;
      if (name === 'delta' && firstDeltaAt === null) firstDeltaAt = Date.now() - started;
      events.push({ name, data: JSON.parse(data) });
    }
  }
  return { status: res.status, events, firstDeltaAt, totalMs: Date.now() - started };
}

const health = await json('/api/health');
check('GET /api/health', health.status === 200 && health.body.status === 'ok', `provider=${health.body?.provider}, db=${health.body?.database}`);

const bad = await json('/api/chat', { method: 'POST', body: JSON.stringify({ message: '', tone: 'casual' }) });
check('rejects empty message', bad.status === 400, bad.body?.error);

const badTone = await json('/api/chat', { method: 'POST', body: JSON.stringify({ message: 'hi', tone: 'pirate' }) });
check('rejects unknown tone', badTone.status === 400, badTone.body?.error);

const first = await chat({ message: 'Say hello in one short sentence.', tone: 'casual' });
const meta = first.events.find((e) => e.name === 'meta');
const deltas = first.events.filter((e) => e.name === 'delta');
const done = first.events.find((e) => e.name === 'done');
check('stream emits meta first', first.events[0]?.name === 'meta');
check('stream emits multiple deltas', deltas.length > 1, `${deltas.length} deltas, first after ${first.firstDeltaAt}ms`);
check('stream ends with done', first.events.at(-1)?.name === 'done', first.events.at(-1)?.name);
const streamedText = deltas.map((e) => e.data.text).join('');
check('done.response equals streamed text', done?.data.exchange.response === streamedText);

const conversationId = meta?.data.conversation._id;
const stored = await json(`/api/conversations/${conversationId}`);
const ex = stored.body?.conversation.exchanges[0];
check('conversation persisted in MongoDB', stored.status === 200 && Boolean(ex));
check('exchange has prompt, response, timestamp, tone', Boolean(ex?.prompt && ex?.response && ex?.timestamp && ex?.tone === 'casual'));
check('exchange status complete', ex?.status === 'complete', ex?.status);

const second = await chat({ conversationId, message: 'And now in a formal way?', tone: 'professional' });
check('follow-up in same conversation streams', second.events.at(-1)?.name === 'done');
const afterSecond = await json(`/api/conversations/${conversationId}`);
check('conversation has 2 exchanges', afterSecond.body?.conversation.exchanges.length === 2);
check('second exchange stored with professional tone', afterSecond.body?.conversation.exchanges[1].tone === 'professional');

const lastId = afterSecond.body.conversation.exchanges[1]._id;
const rewrite = await chat({ conversationId, message: 'And now in a formal way?', tone: 'concise', regenerateExchangeId: lastId });
check('rewrite streams', rewrite.events.at(-1)?.name === 'done');
const afterRewrite = await json(`/api/conversations/${conversationId}`);
check('rewrite replaces the last exchange', afterRewrite.body?.conversation.exchanges.length === 2 && afterRewrite.body.conversation.exchanges[1].tone === 'concise');

const staleRewrite = await json('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ conversationId, message: 'x', tone: 'concise', regenerateExchangeId: lastId }),
});
check('rewrite of a non-latest exchange is rejected', staleRewrite.status === 409, staleRewrite.body?.error);

const list = await json('/api/conversations');
check('list includes the conversation first', list.body?.conversations[0]?._id === conversationId);

const search = await json(`/api/conversations?q=${encodeURIComponent('formal way')}`);
check('search finds it by prompt text', search.body?.conversations.some((c) => c._id === conversationId));

const renamed = await json(`/api/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ title: 'Smoke test chat' }) });
check('rename works', renamed.body?.conversation.title === 'Smoke test chat');

// Abort mid-stream: the partial reply should be saved as "stopped".
const controller = new AbortController();
const res = await fetch(`${BASE}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversationId, message: 'Write a long paragraph about rivers.', tone: 'professional' }),
  signal: controller.signal,
});
const reader = res.body.getReader();
let seenDelta = false;
const dec = new TextDecoder();
while (!seenDelta) {
  const { value, done: ended } = await reader.read();
  if (ended) break;
  if (dec.decode(value).includes('event: delta')) seenDelta = true;
}
controller.abort();
await new Promise((r) => setTimeout(r, 800));
const afterAbort = await json(`/api/conversations/${conversationId}`);
const aborted = afterAbort.body?.conversation.exchanges.at(-1);
check('stop mid-stream saves partial as stopped', aborted?.status === 'stopped', `status=${aborted?.status}, chars=${aborted?.response.length}`);

const del = await json(`/api/conversations/${conversationId}`, { method: 'DELETE' });
check('delete works', del.status === 204);
const gone = await json(`/api/conversations/${conversationId}`);
check('deleted conversation returns 404', gone.status === 404);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
