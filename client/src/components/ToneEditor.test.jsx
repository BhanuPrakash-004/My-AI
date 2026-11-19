import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockFetch } from '../test/fakeServer';
import { ToneEditor } from './ToneEditor';

const tone = (id, label, instruction, customized = false) => ({
  id,
  label,
  instruction,
  defaultInstruction: `Default ${label}.`,
  customized,
  systemPrompt: `You are MyAi.\n<tone_instruction>\nTone: ${label}.\n${instruction}\n</tone_instruction>`,
});

const TONES = [
  tone('professional', 'Professional', 'Default Professional.'),
  tone('casual', 'Casual', 'Talk like a pirate.', true),
  tone('concise', 'Concise', 'Default Concise.'),
];

function setup() {
  const server = mockFetch({
    'GET /api/tones': () => ({ tones: TONES }),
    'PUT /api/tones/professional': (body) => ({ tone: tone('professional', 'Professional', body.instruction, true) }),
    'DELETE /api/tones/casual': () => ({ tone: tone('casual', 'Casual', 'Default Casual.') }),
  });
  const onClose = vi.fn();
  render(<ToneEditor open onClose={onClose} initialTone="professional" />);
  return { ...server, onClose };
}

describe('ToneEditor', () => {
  it('loads the instruction behind each tone', async () => {
    setup();
    const textarea = await screen.findByRole('textbox', { name: 'Instruction for Professional' });
    expect(textarea).toHaveValue('Default Professional.');
    expect(screen.getByRole('tab', { name: /Casual/ })).toHaveTextContent('edited');

    await userEvent.click(screen.getByRole('tab', { name: /Casual/ }));
    expect(screen.getByRole('textbox', { name: 'Instruction for Casual' })).toHaveValue('Talk like a pirate.');
  });

  it('saves a custom instruction and previews the system prompt live', async () => {
    const { calls } = setup();
    const textarea = await screen.findByRole('textbox', { name: 'Instruction for Professional' });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Write like a lawyer.');
    expect(screen.getByText(/Write like a lawyer\./, { selector: 'pre' })).toBeInTheDocument();

    await userEvent.click(save);
    await screen.findByText(/Saved\. New professional replies will follow this instruction\./);
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', path: '/api/tones/professional', body: { instruction: 'Write like a lawyer.' } });
    expect(screen.getByRole('tab', { name: /Professional/ })).toHaveTextContent('edited');
  });

  it('resets a customised tone to its default', async () => {
    const { calls } = setup();
    await screen.findByRole('textbox', { name: 'Instruction for Professional' });
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();

    await userEvent.click(screen.getByRole('tab', { name: /Casual/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Instruction for Casual' })).toHaveValue('Default Casual.'));
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/tones/casual' });
  });

  it('closes with Escape', async () => {
    const { onClose } = setup();
    await screen.findByRole('dialog', { name: 'Tone instructions' });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
