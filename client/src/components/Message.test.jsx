import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { exchangeFixture, MODELS } from '../test/fakeServer';
import { ChatView } from './ChatView';
import { Exchange } from './Message';

const modelsById = Object.fromEntries(MODELS.map((m) => [m.id, m]));

function renderExchange(exchange, props = {}) {
  const handlers = { onRewrite: vi.fn(), onBranch: vi.fn(), onSelect: vi.fn(), onOpenConversation: vi.fn() };
  render(
    <Exchange
      exchange={exchange}
      isLast
      canAct
      currentTone="professional"
      modelsById={modelsById}
      showModel
      branches={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const compareExchange = (overrides = {}) =>
  exchangeFixture({
    mode: 'compare',
    response: '',
    status: 'choosing',
    candidates: [
      { label: 'A', modelId: MODELS[0].id, model: 'claude-opus-5-5', tone: 'professional', response: 'Formal answer.', status: 'complete' },
      { label: 'B', modelId: MODELS[1].id, model: 'gpt-5-mini', tone: 'casual', response: 'Chill answer!', status: 'complete' },
    ],
    ...overrides,
  });

describe('single reply', () => {
  it('shows the prompt, the markdown reply, tone, thinking level and model', () => {
    renderExchange(exchangeFixture({ response: 'Use **bold** text.', thinking: 'deep' }));
    expect(screen.getByText('Hello')).toBeInTheDocument();
    const reply = screen.getByRole('article', { name: 'Professional reply' });
    expect(within(reply).getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByTitle('Thinking level: Deep')).toHaveTextContent('Deep');
    expect(screen.getByText('Claude Opus 5.5')).toBeInTheDocument();
  });

  it('offers to rewrite the latest reply in the newly selected tone', async () => {
    const exchange = exchangeFixture();
    const { onRewrite } = renderExchange(exchange, { currentTone: 'casual' });
    await userEvent.click(screen.getByRole('button', { name: 'Rewrite as Casual' }));
    expect(onRewrite).toHaveBeenCalledWith(exchange);
  });

  it('branches from a message', async () => {
    const exchange = exchangeFixture();
    const { onBranch } = renderExchange(exchange, { isLast: false });
    expect(screen.queryByRole('button', { name: /Rewrite|Regenerate/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Branch' }));
    expect(onBranch).toHaveBeenCalledWith(exchange);
  });

  it('links to branches that start at this message', async () => {
    const { onOpenConversation } = renderExchange(exchangeFixture(), {
      branches: [{ _id: 'c9', title: 'Hello (branch)', exchangeId: 'e1' }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Hello (branch)' }));
    expect(onOpenConversation).toHaveBeenCalledWith('c9');
  });

  it('shows errors with a retry button', async () => {
    const exchange = exchangeFixture({ status: 'error', response: '', error: 'OpenAI rejected the API key.' });
    const { onRewrite } = renderExchange(exchange);
    expect(screen.getByRole('alert')).toHaveTextContent('OpenAI rejected the API key.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRewrite).toHaveBeenCalledWith(exchange);
  });

  it('shows the thinking indicator before the first token', () => {
    renderExchange(exchangeFixture({ status: 'streaming', response: '' }));
    expect(screen.getByText('Thinking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });
});

describe('compare replies', () => {
  it('shows both answers side by side and keeps the chosen one', async () => {
    const exchange = compareExchange();
    const { onSelect } = renderExchange(exchange);

    expect(screen.getByText('Two answers are ready. Keep the one you prefer.')).toBeInTheDocument();
    const a = screen.getByRole('article', { name: 'Answer A' });
    const b = screen.getByRole('article', { name: 'Answer B' });
    expect(within(a).getByText('Formal answer.')).toBeInTheDocument();
    expect(within(a).getByText('Claude Opus 5.5')).toBeInTheDocument();
    expect(within(b).getByText('Chill answer!')).toBeInTheDocument();
    expect(within(b).getByText('Casual')).toBeInTheDocument();

    await userEvent.click(within(b).getByRole('button', { name: 'Keep answer B' }));
    expect(onSelect).toHaveBeenCalledWith(exchange, 1);
  });

  it('disables choosing while answers are still streaming', () => {
    renderExchange(compareExchange({ status: 'streaming' }));
    expect(screen.getByText('Writing two answers side by side.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep answer A' })).toBeDisabled();
  });

  it('cannot keep an answer that failed', () => {
    const exchange = compareExchange();
    exchange.candidates[1] = { ...exchange.candidates[1], response: '', status: 'error', error: 'Model not found.' };
    renderExchange(exchange);
    expect(screen.getByRole('button', { name: 'Keep answer B' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Keep answer A' })).toBeEnabled();
    expect(screen.getByText('Model not found.')).toBeInTheDocument();
  });

  it('after choosing, shows the kept answer and can reveal the other', async () => {
    renderExchange(
      compareExchange({ status: 'complete', selectedCandidate: 1, response: 'Chill answer!', tone: 'casual', modelId: MODELS[1].id }),
    );
    expect(screen.queryByRole('article', { name: 'Answer A' })).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Casual reply' })).toHaveTextContent('Chill answer!');
    expect(screen.getByText(/Kept answer B from a side-by-side comparison/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show answer A' }));
    expect(screen.getByText('Formal answer.')).toBeInTheDocument();
  });
});

describe('ChatView', () => {
  it('shows where a branch came from and where it starts', async () => {
    const onOpenConversation = vi.fn();
    render(
      <ChatView
        conversation={{
          _id: 'c2',
          title: 'Trip (branch)',
          exchanges: [exchangeFixture({ _id: 'x1' }), exchangeFixture({ _id: 'x2', prompt: 'New direction' })],
          branchedFrom: { conversationId: 'c1', title: 'Trip', exists: true, copiedCount: 1 },
          branches: [],
        }}
        isStreaming={false}
        tone="professional"
        onRewrite={vi.fn()}
        onBranch={vi.fn()}
        onSelect={vi.fn()}
        onOpenConversation={onOpenConversation}
        modelsById={modelsById}
        showModel={false}
      />,
    );
    expect(screen.getByRole('separator', { name: 'New branch starts here' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trip' }));
    expect(onOpenConversation).toHaveBeenCalledWith('c1');
  });
});
