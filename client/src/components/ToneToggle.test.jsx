import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThinkingPicker } from './ThinkingPicker';
import { ToneToggle } from './ToneToggle';

describe('ToneToggle', () => {
  it('shows the three tones as a radio group', () => {
    render(<ToneToggle value="casual" onChange={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Professional', 'Casual', 'Concise']);
    expect(screen.getByRole('radio', { name: 'Casual' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Reply tone' })).toBeInTheDocument();
  });

  it('changes tone on click', async () => {
    const onChange = vi.fn();
    render(<ToneToggle value="professional" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Concise' }));
    expect(onChange).toHaveBeenCalledWith('concise');
  });

  it('supports arrow keys, wrapping around', () => {
    const onChange = vi.fn();
    render(<ToneToggle value="concise" onChange={onChange} />);
    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['professional', 'casual', 'professional']);
  });
});

describe('ThinkingPicker', () => {
  it('shows the current level and lets the user pick another', async () => {
    const onChange = vi.fn();
    render(<ThinkingPicker value="balanced" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: 'Thinking level: Balanced' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);

    expect(screen.getByRole('radio', { name: /Balanced/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Thinks longer before answering. Slower.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Deep/ }));

    expect(onChange).toHaveBeenCalledWith('deep');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('closes with Escape or a click outside', async () => {
    render(
      <div>
        <ThinkingPicker value="fast" onChange={() => {}} />
        <p>outside</p>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Thinking level/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Thinking level/ }));
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});
