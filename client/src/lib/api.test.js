import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockFetch, sseResponse } from '../test/fakeServer';
import { api, parseEventStream, streamChat } from './api';

describe('parseEventStream', () => {
  it('parses complete events and keeps the unfinished rest', () => {
    const { events, rest } = parseEventStream(
      'event: meta\ndata: {"a":1}\n\n: keep-alive\n\nevent: delta\ndata: {"text":"Hi"}\n\nevent: delta\ndata: {"te',
    );
    expect(events).toEqual([
      { name: 'meta', data: { a: 1 } },
      { name: 'delta', data: { text: 'Hi' } },
    ]);
    expect(rest).toBe('event: delta\ndata: {"te');
  });

  it('accepts CRLF line endings', () => {
    const { events } = parseEventStream('event: done\r\ndata: {"ok":true}\r\n\r\n');
    expect(events).toEqual([{ name: 'done', data: { ok: true } }]);
  });
});

describe('streamChat', () => {
  it('posts the message and emits every event, even when chunks split an event', async () => {
    const { calls } = mockFetch({
      'POST /api/chat': () =>
        sseResponse([
          ['meta', { conversation: { _id: 'c1' } }],
          ['delta', { text: 'Hel' }],
          ['delta', { candidate: 1, text: 'lo' }],
          ['done', { exchange: { status: 'complete' } }],
        ]),
    });
    const onEvent = vi.fn();
    await streamChat({ message: 'Hi', tone: 'casual', thinking: 'deep' }, { onEvent });

    expect(calls[0].body).toEqual({ message: 'Hi', tone: 'casual', thinking: 'deep' });
    expect(onEvent.mock.calls.map(([name]) => name)).toEqual(['meta', 'delta', 'delta', 'done']);
    expect(onEvent.mock.calls[2][1]).toEqual({ candidate: 1, text: 'lo' });
  });

  it('throws the server error message for a rejected request', async () => {
    mockFetch({ 'POST /api/chat': () => jsonResponse({ error: 'Message cannot be empty.' }, 400) });
    await expect(streamChat({}, { onEvent: vi.fn() })).rejects.toThrow('Message cannot be empty.');
  });

  it('explains when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(streamChat({}, { onEvent: vi.fn() })).rejects.toThrow(/Cannot reach the server/);
  });
});

describe('api', () => {
  it('calls the branch, select and tone endpoints', async () => {
    const { calls } = mockFetch({
      'POST /api/conversations/c1/branch': () => ({ conversation: { _id: 'c2' } }),
      'POST /api/conversations/c1/exchanges/e1/select': () => ({ exchange: {} }),
      'GET /api/tones': () => ({ tones: [] }),
      'PUT /api/tones/casual': () => ({ tone: {} }),
      'DELETE /api/tones/casual': () => ({ tone: {} }),
      'DELETE /api/conversations/c1': () => null,
    });

    await api.branchConversation('c1', 'e1');
    await api.selectCandidate('c1', 'e1', 1);
    await api.listTones();
    await api.saveTone('casual', 'Be chill.');
    await api.resetTone('casual');
    expect(await api.deleteConversation('c1')).toBeNull();

    expect(calls.map((c) => [c.method, c.path, c.body])).toEqual([
      ['POST', '/api/conversations/c1/branch', { exchangeId: 'e1' }],
      ['POST', '/api/conversations/c1/exchanges/e1/select', { candidate: 1 }],
      ['GET', '/api/tones', undefined],
      ['PUT', '/api/tones/casual', { instruction: 'Be chill.' }],
      ['DELETE', '/api/tones/casual', undefined],
      ['DELETE', '/api/conversations/c1', undefined],
    ]);
  });

  it('encodes search queries', async () => {
    const { calls } = mockFetch({ 'GET /api/conversations': () => ({ conversations: [] }) });
    await api.listConversations('a & b');
    expect(calls[0].url).toContain('?q=a%20%26%20b');
  });
});
