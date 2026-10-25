import { describe, expect, it } from 'vitest';
import { calendarDigest, vdotDigest, wellnessDigest, zonesDigest } from '@intervals/core';

// ADR-0006: the context digests moved from apps/worker/src/coach.ts into
// @intervals/core (client and Worker build identical prompts from the same
// code). The chat handler imports them from the package — this guards that
// shared export surface; the digest behaviour itself is unit-tested in
// packages/core/tests/digests.test.ts.
describe('@intervals/core digest contract (chat context)', () => {
  it('exports the four digests the chat handler builds prompts from', () => {
    expect(typeof calendarDigest).toBe('function');
    expect(typeof wellnessDigest).toBe('function');
    expect(typeof zonesDigest).toBe('function');
    expect(typeof vdotDigest).toBe('function');
  });

  it('degrades to readable placeholders on empty mirrors', () => {
    expect(calendarDigest([], [])).toContain('calendar empty');
    expect(wellnessDigest([])).toContain('no wellness data');
    expect(zonesDigest(null)).toContain('not synced');
    expect(vdotDigest([], new Date('2026-10-24T12:00:00Z'))).toBeNull();
  });
});
