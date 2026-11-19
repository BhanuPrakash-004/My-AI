import { describe, expect, it } from 'vitest';
import { THINKING_IDS, THINKING_LEVELS } from '../../src/services/thinking.js';
import { BASE_SYSTEM_PROMPT, buildSystemPrompt, isTone, TONES } from '../../src/services/tones.js';

describe('buildSystemPrompt', () => {
  it('adds the tone as a system instruction modifier', () => {
    const prompt = buildSystemPrompt('casual');
    expect(prompt.startsWith(BASE_SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toContain('<tone_instruction>');
    expect(prompt).toContain('Tone: Casual.');
    expect(prompt).toContain(TONES.casual.defaultInstruction);
  });

  it('gives each tone a different instruction', () => {
    const prompts = Object.keys(TONES).map((id) => buildSystemPrompt(id));
    expect(new Set(prompts).size).toBe(3);
  });

  it('uses a custom instruction instead of the default', () => {
    const prompt = buildSystemPrompt('concise', 'Answer in exactly one sentence.');
    expect(prompt).toContain('Answer in exactly one sentence.');
    expect(prompt).not.toContain(TONES.concise.defaultInstruction);
  });

  it('ignores a blank custom instruction', () => {
    expect(buildSystemPrompt('professional', '   ')).toContain(TONES.professional.defaultInstruction);
  });

  it('falls back to Professional for an unknown tone', () => {
    expect(buildSystemPrompt('pirate')).toContain('Tone: Professional.');
  });

  it('tells the model to switch tone mid-conversation', () => {
    expect(buildSystemPrompt('casual')).toMatch(/even if earlier replies .* used a different tone/);
  });

  it('validates tone ids', () => {
    expect(isTone('casual')).toBe(true);
    expect(isTone('loud')).toBe(false);
  });
});

describe('thinking levels', () => {
  it('maps Fast / Balanced / Deep onto native reasoning effort', () => {
    expect(THINKING_IDS).toEqual(['fast', 'balanced', 'deep']);
    expect(THINKING_LEVELS.fast).toMatchObject({ claudeEffort: 'low', openaiEffort: 'low' });
    expect(THINKING_LEVELS.balanced).toMatchObject({ claudeEffort: 'medium', openaiEffort: 'medium' });
    expect(THINKING_LEVELS.deep).toMatchObject({ claudeEffort: 'high', openaiEffort: 'high' });
  });
});
