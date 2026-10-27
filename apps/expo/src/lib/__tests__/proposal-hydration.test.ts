/**
 * Proposal handoff hydration (parity-2 BUG #17 / swarm A1): the SSE
 * `proposal` event can arrive sparse (id without payload — the row hadn't
 * hydrated) and the modal must never offer Approve/Dismiss from a stub.
 * These are the regression tests for the exact reported failure:
 * event with id-only → not proposable (no actionable buttons);
 * id-only then the pending row hydrates → merge makes it proposable again.
 */
import { describe, expect, it } from 'vitest';
import type { EventEx } from '@intervals/core';
import { isProposable, mergeProposalEvent } from '../proposal-hydration';
import type { Proposal } from '../records';

/** Stub payloads at runtime are `{}` (EventEx types start_date_local as required). */
const EMPTY_PAYLOAD = {} as unknown as EventEx;

/** EventEx minus the given keys — update/delete payloads are partial patches. */
const payloadWithout = (...keys: string[]): EventEx => {
  const p = { ...FULL_CREATE.payload } as unknown as Record<string, unknown>;
  for (const k of keys) delete p[k];
  return p as unknown as EventEx;
};

const FULL_CREATE: Proposal = {
  id: 'row_01',
  kind: 'create_event',
  payload: {
    start_date_local: '2026-11-03T07:00:00',
    name: 'Threshold intervals',
    category: 'WORKOUT',
    type: 'Run',
    distance: 8000,
    moving_time: 2700,
  },
  rationale: 'Adds the quality session your week is missing.',
  status: 'pending',
  created: '2026-10-26T09:00:00.000Z',
  bundleKey: null,
  bundleSummary: null,
};

/** What api.ts built from an SSE frame that carried an id but no payload. */
const ID_ONLY_STUB: Proposal = {
  id: 'row_01',
  kind: 'create_event',
  payload: EMPTY_PAYLOAD,
  rationale: null,
  status: 'pending',
  created: '2026-10-26T09:00:00.000Z',
  bundleKey: null,
  bundleSummary: null,
};

/** Devon's mock-auth failure: the frame carried a payload but no row id. */
const PAYLOAD_NO_ID: Proposal = {
  ...FULL_CREATE,
  id: '',
};

describe('isProposable', () => {
  it('complete proposal → true', () => {
    expect(isProposable(FULL_CREATE)).toBe(true);
  });

  it('REGRESSION: id-only stub (sparse SSE payload) → false — no actionable buttons', () => {
    expect(isProposable(ID_ONLY_STUB)).toBe(false);
  });

  it('REGRESSION: payload without a row id → false — honest failure state', () => {
    expect(isProposable(PAYLOAD_NO_ID)).toBe(false);
  });

  it('null/undefined → false', () => {
    expect(isProposable(null)).toBe(false);
    expect(isProposable(undefined)).toBe(false);
  });

  it('empty / whitespace id → false', () => {
    expect(isProposable({ ...FULL_CREATE, id: '' })).toBe(false);
    expect(isProposable({ ...FULL_CREATE, id: '   ' })).toBe(false);
  });

  it('create_event without start_date_local → false', () => {
    expect(isProposable({ ...FULL_CREATE, payload: payloadWithout('start_date_local') })).toBe(false);
  });

  // The validator (packages/core validateEventEx) builds update/delete
  // payloads with requireStart=false — a partial patch keyed by the target.
  // Requiring a date there would block valid approvals.
  it('update_event keyed by numeric id → true even without a date', () => {
    expect(
      isProposable({ ...FULL_CREATE, kind: 'update_event', payload: { id: 147702969 } as EventEx }),
    ).toBe(true);
  });

  it('update_event keyed by uid → true', () => {
    expect(
      isProposable({
        ...FULL_CREATE,
        kind: 'update_event',
        payload: { uid: '9f8c2a58-6bd1-4a55-9db2-1f6f3f2c9e10' } as EventEx,
      }),
    ).toBe(true);
  });

  it('update_event with an empty payload (no target) → false', () => {
    expect(isProposable({ ...FULL_CREATE, kind: 'update_event', payload: EMPTY_PAYLOAD })).toBe(false);
  });

  it('delete_event keyed by id → true', () => {
    expect(
      isProposable({ ...FULL_CREATE, kind: 'delete_event', payload: { id: 147702969 } as EventEx }),
    ).toBe(true);
  });
});

describe('mergeProposalEvent', () => {
  it('REGRESSION: id-only stub + hydrated pending row → proposable payload', () => {
    const row: Proposal = { ...FULL_CREATE, rationale: null };
    const merged = mergeProposalEvent(ID_ONLY_STUB, row);
    expect(isProposable(merged)).toBe(true);
    expect(merged.id).toBe('row_01');
    expect(merged.payload.name).toBe('Threshold intervals');
    expect(merged.payload.start_date_local).toBe('2026-11-03T07:00:00');
    expect(merged.payload.distance).toBe(8000);
  });

  it('fuller event survives a sparse row (existing keys win)', () => {
    const sparseRow: Proposal = { ...FULL_CREATE, payload: EMPTY_PAYLOAD };
    const merged = mergeProposalEvent(FULL_CREATE, sparseRow);
    expect(isProposable(merged)).toBe(true);
    expect(merged.payload).toEqual(FULL_CREATE.payload);
  });

  it('payloads merge key-wise from partial overlaps', () => {
    const existing: Proposal = {
      ...FULL_CREATE,
      payload: { name: 'Threshold intervals', distance: 8000 } as EventEx,
    };
    const incoming: Proposal = {
      ...FULL_CREATE,
      payload: { start_date_local: '2026-11-03T07:00:00', moving_time: 2700 } as EventEx,
    };
    const merged = mergeProposalEvent(existing, incoming);
    expect(merged.payload).toEqual({
      name: 'Threshold intervals',
      distance: 8000,
      start_date_local: '2026-11-03T07:00:00',
      moving_time: 2700,
    });
  });

  it('scalar fields fill from whichever side has them', () => {
    const merged = mergeProposalEvent(ID_ONLY_STUB, { ...FULL_CREATE, id: 'other' });
    expect(merged.id).toBe(ID_ONLY_STUB.id); // existing id wins
    expect(merged.rationale).toBe(FULL_CREATE.rationale); // gap filled
    expect(merged.kind).toBe('create_event');
    expect(merged.created).toBe(FULL_CREATE.created);
  });

  it('bundle fields fill from the fuller row', () => {
    const bundled: Proposal = {
      ...FULL_CREATE,
      bundleKey: 'down-week',
      bundleSummary: 'Shift the quality day',
    };
    const merged = mergeProposalEvent(ID_ONLY_STUB, bundled);
    expect(merged.bundleKey).toBe('down-week');
    expect(merged.bundleSummary).toBe('Shift the quality day');
  });

  it('null sides are total: null+row → row, event+null → event, null+null → inert stub', () => {
    expect(mergeProposalEvent(null, FULL_CREATE)).toEqual(FULL_CREATE);
    expect(mergeProposalEvent(FULL_CREATE, null)).toEqual(FULL_CREATE);
    const empty = mergeProposalEvent(null, null);
    expect(isProposable(empty)).toBe(false);
  });
});
