/** relativeTime — sync freshness labels (FIX-6). Pure, now injectable. */
import { describe, expect, it } from 'vitest';
import { relativeTime } from '../format';

const NOW = new Date('2026-10-24T12:00:00Z');

describe('relativeTime', () => {
  it('says never for null/undefined/garbage', () => {
    expect(relativeTime(null, NOW)).toBe('never');
    expect(relativeTime(undefined, NOW)).toBe('never');
    expect(relativeTime('not-a-date', NOW)).toBe('never');
  });

  it('says just now under a minute', () => {
    expect(relativeTime('2026-10-24T11:59:30Z', NOW)).toBe('just now');
  });

  it('formats minutes and hours', () => {
    expect(relativeTime('2026-10-24T11:45:00Z', NOW)).toBe('15m ago');
    expect(relativeTime('2026-10-24T09:00:00Z', NOW)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(relativeTime('2026-10-21T12:00:00Z', NOW)).toBe('3d ago');
  });

  it('clamps future timestamps to just now', () => {
    expect(relativeTime('2026-10-24T12:30:00Z', NOW)).toBe('just now');
  });
});
