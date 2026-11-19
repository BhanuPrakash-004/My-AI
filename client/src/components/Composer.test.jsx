import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MODELS } from '../test/fakeServer';
import { Composer } from './Composer';

function setup(props = {}) {
  const handlers = {
    onSend: vi.fn(),
    onStop: vi.fn(),
    onToneChange: vi.fn(),
    onThinkingChange: vi.fn(),
    onToggleCompare: vi.fn(),
    onCompareChange: vi.fn(),
  };
  render(
    <Composer
      tone="professional"
      thinking="balanced"
      models={MODELS}
      modelId={MODELS[0].id}
      compare={{ enabled: false }}
      isStreaming={false}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, input: screen.getByRole('textbox', { name: 'Message' }) };
}

describe('Composer', () => {
  it('sends the message with Enter and clears the box', async () => {
    const { input, onSend } = setup();
    await userEvent.type(input, '  Hello there  {Enter}');
    expect(onSend).toHaveBeenCalledWith('  Hello there  ');
    expect(input).toHaveValue('');
  });

  it('adds a new line with Shift+Enter instead of sending', async () => {
    const { input, onSend } = setup();
    await userEvent.type(input, 'Line one{Shift>}{Enter}{/Shift}Line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('Line one\nLine two');
  });

  it('disables Send for an empty message', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('shows Stop while a reply is streaming', async () => {
    const { onStop } = setup({ isStreaming: true });
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(onStop).toHaveBeenCalled();
  });

  it('blocks sending while the user still has to pick a compared answer', async () => {
    const { input, onSend } = setup({ blockedReason: 'Keep one of the two answers above to continue the chat.' });
    await userEvent.type(input, 'Next question{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('Keep one of the two answers above to continue the chat.')).toBeInTheDocument();
  });

  it('describes the selected tone below the box', () => {
    setup({ tone: 'concise' });
    expect(screen.getByText(/Replies will be short and to the point\./)).toBeInTheDocument();
  });

  it('toggles compare mode', async () => {
    const { onToggleCompare } = setup();
    const toggle = screen.getByRole('button', { name: 'Compare two answers' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(onToggleCompare).toHaveBeenCalled();
  });

  it('lets the user choose model and tone for answer B', async () => {
    const { onCompareChange, onToggleCompare } = setup({
      compare: { enabled: true, modelId: MODELS[1].id, tone: 'casual' },
    });
    expect(screen.getByRole('button', { name: 'Compare two answers' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/two answers side by side/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tone for answer B' }), 'concise');
    expect(onCompareChange).toHaveBeenCalledWith({ tone: 'concise' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Model for answer B' }), MODELS[0].id);
    expect(onCompareChange).toHaveBeenCalledWith({ modelId: MODELS[0].id });

    await userEvent.click(screen.getByRole('button', { name: 'Turn off compare' }));
    expect(onToggleCompare).toHaveBeenCalledWith(false);
  });
});
