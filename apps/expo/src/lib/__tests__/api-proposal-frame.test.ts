/**
 * SSE `proposal` frame mapping (parity-2 BUG #17): api.ts must never build a
 * proposal from a frame that has neither a row id nor a payload — that stub
 * opened a hollow modal whose Approve POSTed `/api/proposals//apply` (404).
 * Sparse-but-usable frames (id xor payload) still map so the modal can render
 * its syncing / honest-failure state and hydrate (lib/proposal-hydration.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false; // api.ts reads it at module scope
  return {
    pb: {
      authStore: { isValid: true, token: 'pb-token' },
    },
  };
});

vi.mock('@/lib/pb', () => ({ pb: h.pb }));

import { proposalFromFrame } from '../api';
import { isProposable, mergeProposalEvent } from '../proposal-hydration';

const FULL_PAYLOAD = {
  start_date_local: '2026-11-03T07:00:00',
  name: 'Threshold intervals',
  category: 'WORKOUT',
  type: 'Run',
  distance: 8000,
  moving_time: 2700,
};

describe('proposalFromFrame', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('complete frame → full proposal', () => {
    const p = proposalFromFrame({
      id: 'row_01',
      kind: 'create_event',
      payload: FULL_PAYLOAD,
      rationale: 'Why',
      bundle: { key: 'down-week', summary: 'Shift the quality day' },
    });
    expect(p).toMatchObject({
      id: 'row_01',
      kind: 'create_event',
      payload: FULL_PAYLOAD,
      rationale: 'Why',
      status: 'pending',
      created: '2026-10-26T09:00:00.000Z',
      bundleKey: 'down-week',
      bundleSummary: 'Shift the quality day',
    });
    expect(isProposable(p)).toBe(true);
  });

  it('REGRESSION: empty frame (no id, no payload) → null — dropped, never a stub', () => {
    expect(proposalFromFrame({})).toBeNull();
    expect(proposalFromFrame({ rationale: 'words only' })).toBeNull();
  });

  it('REGRESSION: blank-string id with no payload → null', () => {
    expect(proposalFromFrame({ id: '' })).toBeNull();
  });

  it('id-only frame (sparse) → proposal with empty payload; not proposable', () => {
    const p = proposalFromFrame({ id: 'row_01', kind: 'create_event' });
    expect(p).not.toBeNull();
    expect(p!.id).toBe('row_01');
    expect(p!.payload).toEqual({});
    expect(isProposable(p)).toBe(false);
  });

  it('payload without id (unauthenticated write) → proposal with blank id', () => {
    const p = proposalFromFrame({ payload: FULL_PAYLOAD, rationale: 'Why' });
    expect(p).not.toBeNull();
    expect(p!.id).toBe('');
    expect(p!.payload).toEqual(FULL_PAYLOAD);
    expect(isProposable(p)).toBe(false);
  });

  it('numeric id is not a PB row id — treated as absent', () => {
    const p = proposalFromFrame({ id: 123, payload: FULL_PAYLOAD });
    expect(p!.id).toBe('');
    expect(p!.payload).toEqual(FULL_PAYLOAD);
  });

  it('REGRESSION: id-only frame then the pending row hydrates → merge is proposable', () => {
    const frame = proposalFromFrame({ id: 'row_01', kind: 'create_event' })!;
    const row = proposalFromFrame({ id: 'row_01', payload: FULL_PAYLOAD, rationale: 'Why' })!;
    const merged = mergeProposalEvent(frame, row);
    expect(isProposable(merged)).toBe(true);
    expect(merged.payload).toEqual(FULL_PAYLOAD);
    expect(merged.rationale).toBe('Why');
  });
});
