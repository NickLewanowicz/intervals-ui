/**
 * The coach's write-path contract: every calendar mutation the AI wants is
 * first a *proposal*. Nothing reaches intervals.icu until the user approves
 * it in the steering modal/sheet (docs/SPEC.md "steered writes").
 *
 * The LLM emits a tool call; the worker validates it into a Proposal and
 * stores it (status=pending) in PocketBase; the client renders the modal;
 * approval calls worker POST /api/proposals/:id/apply which performs the
 * intervals.icu write with the user's own API key.
 */
import type { EventEx } from './types';
import { EVENT_CATEGORIES, SPORT_TYPES } from './types';

export const PROPOSAL_KINDS = [
  'create_event',
  'update_event',
  'delete_event',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export interface Proposal<P = unknown> {
  id: string;
  kind: ProposalKind;
  payload: P;
  /** Free-text from the coach explaining the change (shown in the modal). */
  rationale?: string;
  status: 'pending' | 'applied' | 'dismissed' | 'failed';
  intervals_event_id?: number;
  error?: string;
  /** Grouping for related changes made for one holistic reason (v2). */
  bundleKey?: string;
  bundleSummary?: string;
}

export class ProposalValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ProposalValidationError';
  }
}

const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(path: string, msg: string): never {
  throw new ProposalValidationError(`${path}: ${msg}`, path);
}

/**
 * Validate the LLM-produced EventEx subset we allow the coach to write.
 * Mirrors intervals.icu semantics (ADR-0002): the coach writes the
 * human-readable `description`; the server parses it into structure and
 * computes load. Races are category RACE_A/B/C, never a separate type.
 * `requireStart` is false for update/delete payloads (id/uid + deltas only).
 */
export function validateEventEx(input: unknown, requireStart = true): EventEx {
  if (typeof input !== 'object' || input === null) fail('event', 'expected object');
  const e = input as Record<string, unknown>;

  const startOk =
    typeof e.start_date_local === 'string' && LOCAL_DT_RE.test(e.start_date_local);
  if (requireStart && !startOk) {
    fail(
      'start_date_local',
      'must be athlete-local ISO-ish "YYYY-MM-DDTHH:mm[:ss]" without timezone offset',
    );
  }
  if (!requireStart && e.start_date_local !== undefined && !startOk) {
    fail('start_date_local', 'must be "YYYY-MM-DDTHH:mm[:ss]" without timezone offset');
  }
  if (e.category !== undefined && !EVENT_CATEGORIES.includes(e.category as never)) {
    fail('category', `must be one of ${EVENT_CATEGORIES.join('|')}`);
  }
  if (e.type !== undefined && !SPORT_TYPES.includes(e.type as never)) {
    fail('type', `must be one of ${SPORT_TYPES.join('|')}`);
  }
  if (e.name !== undefined && typeof e.name !== 'string') fail('name', 'must be string');
  if (e.description !== undefined && typeof e.description !== 'string') {
    fail('description', 'must be string');
  }
  for (const numField of ['distance', 'moving_time'] as const) {
    const v = e[numField];
    if (v !== undefined && (typeof v !== 'number' || v < 0 || !Number.isFinite(v))) {
      fail(numField, 'must be a non-negative number (meters / seconds)');
    }
  }
  if (e.uid !== undefined && (typeof e.uid !== 'string' || !UUID_RE.test(e.uid))) {
    fail('uid', 'must be a UUID v4 string');
  }
  if (e.id !== undefined && (typeof e.id !== 'number' || !Number.isInteger(e.id))) {
    fail('id', 'must be an integer intervals.icu event id');
  }

  return {
    ...(e as unknown as EventEx),
    start_date_local: e.start_date_local as string,
  };
}

/** Validate an LLM tool-call into a typed Proposal; throws ProposalValidationError. */
export function validateProposal(toolName: string, args: unknown): {
  kind: ProposalKind;
  payload: EventEx;
  rationale?: string;
  bundle?: { key: string; summary: string };
} {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>;
  const rationale = typeof a.rationale === 'string' ? a.rationale : undefined;

  // Optional bundle: { summary } — groups related changes made for one
  // holistic reason. Normalized to a grouping key (exact, case-insensitive).
  // Stripped from EventEx args so it never reaches intervals.icu.
  let bundle: { key: string; summary: string } | undefined;
  const rawBundle = (a.bundle ?? null) as { summary?: unknown } | null | undefined;
  if (rawBundle && typeof rawBundle.summary === 'string' && rawBundle.summary.trim()) {
    const summary = rawBundle.summary.trim().slice(0, 120);
    bundle = {
      summary,
      key: summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bundle',
    };
    delete a.bundle;
  }

  switch (toolName) {
    case 'propose_event':
    case 'create_event': {
      // allow either a bare EventEx or { event: EventEx } wrapper
      const raw = a.event ?? a;
      const event = validateEventEx(raw);
      const isRace = ['RACE_A', 'RACE_B', 'RACE_C'].includes(event.category ?? '');
      if (isRace && !event.distance) {
        // races without a known distance are allowed, but flag for the user
        // (validation stays soft — the modal shows what will be written)
      }
      return { kind: 'create_event', payload: event, rationale, ...(bundle ? { bundle } : {}) };
    }
    case 'update_event': {
      const event = validateEventEx(a.event ?? a, false);
      if (event.id === undefined && event.uid === undefined) {
        fail('event.id|event.uid', 'update needs the intervals.icu event id or uid');
      }
      return { kind: 'update_event', payload: event, rationale, ...(bundle ? { bundle } : {}) };
    }
    case 'delete_event': {
      const event = validateEventEx(a.event ?? a, false);
      if (event.id === undefined) fail('event.id', 'delete needs the event id');
      return { kind: 'delete_event', payload: event, rationale, ...(bundle ? { bundle } : {}) };
    }
    default:
      fail('tool', `unknown proposal tool "${toolName}"`);
  }
}

/** Deterministic uid for coach-created events (idempotent re-planning). */
export function coachUid(sessionId: string, salt: string): string {
  // Two FNV-1a/xmur3-style words → 32 hex chars, formatted as a v4-shaped
  // UUID. Uniqueness only — this is not cryptographic.
  const s = sessionId + ':' + salt;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h3 = (Math.imul(h3 ^ c, 0xc2b2ae35) + i) >>> 0;
    h4 = (Math.imul(h4 + c, 0x27d4eb2f) ^ i) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const w1 = hex(h1);
  const w2 = hex(h2).slice(0, 4);
  const w3 = '4' + hex(h3).slice(0, 3); // version 4
  const w4 = (8 | (h4 >>> 29)).toString(16) + hex(h4).slice(0, 3); // variant 8..b
  const w5 = (hex((h4 ^ h1) >>> 0) + hex((h2 ^ h3) >>> 0)).slice(0, 12);
  return `${w1}-${w2}-${w3}-${w4}-${w5}`;
}
