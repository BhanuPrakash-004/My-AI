import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { exchangeFixture, HEALTH, MODELS, mockFetch, sseResponse } from '../test/fakeServer';
import { useChat } from './useChat';

const conversation = { _id: 'c1', title: 'Hello', tone: 'casual', updatedAt: '2026-11-19T10:00:00Z', exchangeCount: 1, lastTone: 'casual' };

const baseRoutes = (extra = {}) => ({
  'GET /api/health': () => HEALTH,
  'GET /api/conversations': () => ({ conversations: [] }),
  ...extra,
});

async function renderChat(routes) {
  const server = mockFetch(routes);
  const hook = renderHook(() => useChat());
  await waitFor(() => expect(hook.result.current.health.status).toBe('ok'));
  await waitFor(() => expect(hook.result.current.listState).toBe('ready'));
  return { ...server, ...hook };
}

describe('useChat', () => {
  it('loads models and defaults to the first one', async () => {
    const { result } = await renderChat(baseRoutes());
    expect(result.current.models).toHaveLength(2);
    expect(result.current.modelId).toBe(MODELS[0].id);
    expect(result.current.thinking).toBe('balanced');
  });

  it('streams a reply into a new conversation with the chosen tone, thinking and model', async () => {
    const { result, calls } = await renderChat(
      baseRoutes({
        'POST /api/chat': () =>
          sseResponse([
            ['meta', { conversation, exchange: { _id: 'e1', timestamp: '2026-11-19T10:00:00Z' } }],
            ['delta', { text: 'Hello ' }],
            ['delta', { text: 'world' }],
            ['done', { conversation, exchange: exchangeFixture({ response: 'Hello world', tone: 'casual', thinking: 'deep' }) }],
          ]),
      }),
    );

    act(() => {
      result.current.setTone('casual');
      result.current.setThinking('deep');
      result.current.setModelId(MODELS[1].id);
    });
    await act(() => result.current.send('Hello'));

    const body = calls.find((c) => c.path === '/api/chat').body;
    expect(body).toMatchObject({ message: 'Hello', tone: 'casual', thinking: 'deep', modelId: MODELS[1].id });
    expect(body.compare).toBeUndefined();

    const active = result.current.active;
    expect(active._id).toBe('c1');
    expect(active.exchanges).toHaveLength(1);
    expect(active.exchanges[0]).toMatchObject({ _id: 'e1', response: 'Hello world', status: 'complete', live: true });
    expect(result.current.conversations[0]._id).toBe('c1');
    expect(result.current.isStreaming).toBe(false);
    expect(window.location.hash).toBe('#/c/c1');
    expect(localStorage.getItem('myai-thinking')).toBe('deep');
    // The welcome intro is gone after the first message.
    expect(localStorage.getItem('myai-intro-done')).toBe('1');
    expect(result.current.showIntro).toBe(false);
  });

  it('compares two answers, blocks the chat until one is kept, then keeps it', async () => {
    const candidates = [
      { label: 'A', modelId: MODELS[0].id, tone: 'professional', response: 'Formal.', status: 'complete' },
      { label: 'B', modelId: MODELS[1].id, tone: 'professional', response: 'Also formal.', status: 'complete' },
    ];
    const { result, calls } = await renderChat(
      baseRoutes({
        'POST /api/chat': () =>
          sseResponse([
            ['meta', { conversation, exchange: { _id: 'e1', timestamp: '2026-11-19T10:00:00Z' } }],
            ['delta', { candidate: 0, text: 'Formal.' }],
            ['delta', { candidate: 1, text: 'Also ' }],
            ['delta', { candidate: 1, text: 'formal.' }],
            ['candidate', { index: 0, candidate: candidates[0] }],
            ['candidate', { index: 1, candidate: candidates[1] }],
            ['done', { conversation, exchange: exchangeFixture({ mode: 'compare', status: 'choosing', response: '', candidates }) }],
          ]),
        'POST /api/conversations/c1/exchanges/e1/select': () => ({
          exchange: exchangeFixture({ mode: 'compare', candidates, status: 'complete', selectedCandidate: 1, response: 'Also formal.' }),
          conversation,
        }),
      }),
    );

    act(() => result.current.toggleCompare());
    // Side B defaults to the other configured model.
    expect(result.current.compare).toEqual({ enabled: true, modelId: MODELS[1].id, tone: 'professional' });

    await act(() => result.current.send('Which is better?'));
    expect(calls.find((c) => c.path === '/api/chat').body.compare).toEqual({ modelId: MODELS[1].id, tone: 'professional' });

    let exchange = result.current.active.exchanges[0];
    expect(exchange.status).toBe('choosing');
    expect(exchange.candidates.map((c) => c.response)).toEqual(['Formal.', 'Also formal.']);
    expect(result.current.awaitingChoice).toBe(true);

    await act(() => result.current.selectCandidate(exchange, 1));
    exchange = result.current.active.exchanges[0];
    expect(exchange).toMatchObject({ selectedCandidate: 1, response: 'Also formal.', status: 'complete' });
    expect(result.current.awaitingChoice).toBe(false);
  });

  it('compares two tones when only one model is configured', async () => {
    const { result } = await renderChat(baseRoutes({ 'GET /api/health': () => ({ ...HEALTH, models: [MODELS[0]] }) }));
    act(() => result.current.toggleCompare());
    expect(result.current.compare).toEqual({ enabled: true, modelId: MODELS[0].id, tone: 'casual' });
  });

  it('branches into a new conversation and opens it', async () => {
    const original = { ...conversation, exchanges: [exchangeFixture()], branches: [] };
    const branch = {
      ...conversation,
      _id: 'c2',
      title: 'Hello (branch)',
      exchanges: [exchangeFixture({ _id: 'b1' })],
      branchedFrom: { conversationId: 'c1', exchangeId: 'e1', title: 'Hello', copiedCount: 1, exists: true },
      branches: [],
    };
    const { result, calls } = await renderChat(
      baseRoutes({
        'GET /api/conversations/c1': () => ({ conversation: original }),
        'POST /api/conversations/c1/branch': () => ({ conversation: branch }),
      }),
    );

    await act(() => result.current.openConversation('c1'));
    expect(result.current.active._id).toBe('c1');

    await act(() => result.current.branch(result.current.active.exchanges[0]));
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: '/api/conversations/c1/branch', body: { exchangeId: 'e1' } });
    expect(result.current.active._id).toBe('c2');
    expect(result.current.conversations[0]).toMatchObject({ _id: 'c2', isBranch: true });
    expect(result.current.toast.message).toMatch(/Branched into a new chat/);
  });

  it('marks the reply as failed when the server rejects the request', async () => {
    const { result } = await renderChat(
      baseRoutes({
        'POST /api/chat': () => new Response(JSON.stringify({ error: 'Unknown model "x".' }), { status: 400 }),
      }),
    );
    await act(() => result.current.send('Hi'));
    expect(result.current.active.exchanges[0]).toMatchObject({ status: 'error', error: 'Unknown model "x".' });
  });
});
