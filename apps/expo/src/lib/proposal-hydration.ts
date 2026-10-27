/**
 * Pure guards + merge for the proposal handoff (parity-2 BUG #17 / swarm A1):
 * the SSE `proposal` event can arrive sparse — an id with no payload, or a
 * payload with no row id — and the pending/session rows can hydrate late.
 * The review modal must never offer Approve/Dismiss from a stub: an empty id
 * POSTs `/api/proposals//apply` (404, silently), and an empty payload renders
 * a hollow "Add to calendar" shell whose buttons dead-click. Unit tested.
 */
import type { EventEx } from '@intervals/core';
import type { Proposal } from './records';

/**
 * The sparse-payload shape a stub event actually carries at runtime (the SSE
 * frame's `payload` may be missing entirely); EventEx types it as required,
 * so the empty object is asserted like api.ts's frame mapping does.
 */
const EMPTY_PAYLOAD = {} as EventEx;

const hasText = (v: string | null | undefined): v is string =>
  typeof v === 'string' && v.trim() !== '';

/** update/delete payloads target a mirrored event: numeric id or uid. */
const hasTarget = (p: Proposal): boolean =>
  (typeof p.payload.id === 'number' && Number.isFinite(p.payload.id)) ||
  hasText(p.payload.uid);

/**
 * True when the modal may render ENABLED Approve/Dismiss: a non-empty row id
 * (what apply/dismiss POSTs) AND a payload that identifies the change.
 *
 * "Identifies the change" is kind-aware, per the validator contract
 * (packages/core validateEventEx): create_event payloads always carry a real
 * `start_date_local`; update/delete payloads are partial patches keyed by the
 * intervals.icu target (id/uid) — their date legitimately lives on the mirror
 * side of the diff, so requiring it here would block valid approvals.
 */
export function isProposable(p: Proposal | null | undefined): boolean {
  if (!p || !hasText(p.id)) return false;
  if (!p.payload || typeof p.payload !== 'object') return false;
  if (p.kind === 'create_event') return hasText(p.payload.start_date_local);
  return hasTarget(p);
}

const defined = (v: unknown): boolean => v !== undefined && v !== null && v !== '';

/**
 * Fill a sparse proposal from a fuller one (the PB pending/session row):
 * every field `existing` has wins; `incoming` fills the gaps; payloads merge
 * key-wise the same way. Total — null inputs are treated as absent sides.
 */
export function mergeProposalEvent(
  existing: Proposal | null | undefined,
  incoming: Proposal | null | undefined,
): Proposal {
  if (!existing && !incoming) {
    return {
      id: '',
      kind: 'create_event',
      payload: EMPTY_PAYLOAD,
      rationale: null,
      status: 'pending',
      created: null,
      bundleKey: null,
      bundleSummary: null,
    };
  }
  const payload = { ...(incoming?.payload ?? EMPTY_PAYLOAD) };
  for (const [k, v] of Object.entries(existing?.payload ?? {})) {
    if (defined(v)) (payload as unknown as Record<string, unknown>)[k] = v;
  }
  return {
    id: hasText(existing?.id) ? existing.id : (incoming?.id ?? ''),
    kind: existing?.kind ?? incoming?.kind ?? 'create_event',
    payload,
    rationale: existing?.rationale ?? incoming?.rationale ?? null,
    status: existing?.status ?? incoming?.status,
    created: existing?.created ?? incoming?.created ?? null,
    bundleKey: existing?.bundleKey ?? incoming?.bundleKey ?? null,
    bundleSummary: existing?.bundleSummary ?? incoming?.bundleSummary ?? null,
  };
}
