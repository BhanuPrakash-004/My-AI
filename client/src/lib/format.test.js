import { describe, expect, it } from 'vitest';
import { formatModelName, formatTimestamp, groupByRecency } from './format';

describe('groupByRecency', () => {
  const now = new Date('2026-11-19T15:00:00');
  const at = (iso) => ({ _id: iso, updatedAt: iso });

  it('groups conversations into readable buckets, keeping order', () => {
    const groups = groupByRecency(
      [
        at('2026-11-19T09:00:00'),
        at('2026-11-18T22:00:00'),
        at('2026-11-15T10:00:00'),
        at('2026-11-01T10:00:00'),
        at('2026-08-03T10:00:00'),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ['Today', 1],
      ['Yesterday', 1],
      ['Previous 7 days', 1],
      ['Previous 30 days', 1],
      [new Date('2026-08-03T10:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), 1],
    ]);
  });

  it('returns no groups for an empty list', () => {
    expect(groupByRecency([], now)).toEqual([]);
  });
});

describe('formatTimestamp', () => {
  it('shows only the time for today and adds the date otherwise', () => {
    const today = new Date();
    today.setHours(9, 5, 0, 0);
    expect(formatTimestamp(today.toISOString())).not.toMatch(/,/);
    expect(formatTimestamp('2020-01-02T09:05:00')).toMatch(/,/);
    expect(formatTimestamp(null)).toBe('');
  });
});

describe('formatModelName', () => {
  it.each([
    ['claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-haiku-4-5', 'Claude Haiku 4.5'],
    ['gpt-5-mini', 'gpt-5-mini'],
    ['demo', 'Demo mode'],
  ])('%s -> %s', (id, label) => {
    expect(formatModelName(id)).toBe(label);
  });
});
