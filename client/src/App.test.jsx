import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import { HEALTH, mockFetch } from './test/fakeServer';

const HISTORY = [
  { _id: 'c1', title: 'Trip planning', updatedAt: new Date().toISOString(), lastTone: 'casual', isBranch: false },
  { _id: 'c2', title: 'Trip planning (branch)', updatedAt: new Date().toISOString(), lastTone: 'concise', isBranch: true },
];

const routes = (health = HEALTH, conversations = HISTORY) => ({
  'GET /api/health': () => health,
  'GET /api/conversations': () => ({ conversations }),
  'GET /api/tones': () => ({ tones: [] }),
});

const INTRO = { name: /Ask anything\.\s*Choose how it sounds\./ };

describe('App', () => {
  it('welcomes first-time visitors with the intro', async () => {
    mockFetch(routes(HEALTH, []));
    render(<App />);
    expect(screen.getByRole('heading', INTRO)).toBeInTheDocument();
    expect(await screen.findByText('No conversations yet. Your chats will be saved here.')).toBeInTheDocument();
    expect(screen.getByRole('heading', INTRO)).toBeInTheDocument();
  });

  it('skips the intro once a message has been sent', async () => {
    localStorage.setItem('myai-intro-done', '1');
    mockFetch(routes(HEALTH, []));
    render(<App />);
    expect(screen.queryByRole('heading', INTRO)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What would you like to ask?' })).toBeInTheDocument();
  });

  it('renders history and composer controls for returning users, without the intro', async () => {
    mockFetch(routes());
    render(<App />);

    const history = screen.getByRole('navigation', { name: 'Past conversations' });
    expect(await within(history).findByText('Trip planning')).toBeInTheDocument();
    expect(within(history).getByRole('img', { name: 'Branch' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', INTRO)).not.toBeInTheDocument();

    expect(screen.getByRole('radiogroup', { name: 'Reply tone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thinking level/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare two answers' })).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Model' })).toHaveValue(HEALTH.models[0].id);
  });

  it('explains demo mode', async () => {
    mockFetch(routes({ ...HEALTH, demo: true, models: [{ ...HEALTH.models[0], label: 'Demo model', demo: true }] }));
    render(<App />);
    expect(await screen.findByText(/Demo mode: replies are samples/)).toBeInTheDocument();
  });

  it('opens the tone settings', async () => {
    mockFetch(routes());
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Tone settings' }));
    expect(await screen.findByRole('dialog', { name: 'Tone instructions' })).toBeInTheDocument();
  });
});
