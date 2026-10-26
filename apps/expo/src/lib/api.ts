/**
 * Worker client (src/index.ts of apps/worker is the contract):
 *   POST /api/chat              SSE: delta | proposal | done | error
 *   GET  /api/proposals?status= Bearer = PB user token
 *   POST /api/proposals/:id/apply | /dismiss
 *   POST /api/sync
 *
 * The client NEVER talks to intervals.icu or OpenRouter directly.
 */
import type { EventEx } from '@intervals/core';
import { pb } from './pb';
import { createSSEParser, readSSEResponse, type SSEHandler } from './sse';
import type { Proposal, ProposalKind } from './records';

/**
 * FIX-1: the worker URL must never silently fall back to localhost in a
 * production build (that shipped once — chat/sync/proposals were dead on the
 * deployed site while every error said "is it running?"). Localhost is only
 * for dev; production builds bake the deployed worker (env var wins when set).
 */
const PROD_WORKER_URL = 'https://intervals-coach.imnick.workers.dev';
export const WORKER_URL =
  process.env.EXPO_PUBLIC_WORKER_URL ?? (__DEV__ ? 'http://localhost:8787' : PROD_WORKER_URL);

export class WorkerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

function authHeaders(): Record<string, string> {
  if (!pb.authStore.isValid) throw new WorkerError(401, 'Not signed in');
  return { Authorization: `Bearer ${pb.authStore.token}` };
}

async function workerJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}${path}`, {
      ...init,
      headers: { ...authHeaders(), 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new WorkerError(
      0,
      __DEV__
        ? `Worker unreachable (${WORKER_URL}) — is it running?`
        : `Coach service unreachable (${WORKER_URL}) — try again shortly.`,
    );
  }
  const text = await res.text();
  if (!res.ok) {
    let detail: string = text.slice(0, 300);
    try {
      const parsed = (JSON.parse(text) as Record<string, unknown>).error;
      if (parsed != null) detail = String(parsed);
    } catch {
      /* raw body */
    }
    throw new WorkerError(res.status, detail);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------- chat stream ----------

export interface ChatStreamEvent {
  onDelta: (text: string) => void;
  onProposal: (p: Proposal) => void;
  onDone: (d: ChatDone) => void;
  onError: (message: string) => void;
}

export interface ChatDone {
  session_id: string;
  usage?: Record<string, unknown> | null;
  proposal_errors?: Array<{ tool: string; error: string }>;
}

export interface ChatStreamOptions {
  sessionId?: string;
  message: string;
  model?: string;
  signal?: AbortSignal;
  /**
   * Fires as soon as the worker reports the session id (the `start` SSE event,
   * sent before the first delta) — the screen binds the transcript to the
   * session immediately, so a mid-stream stop still lands in the right chat.
   */
  onSession?: (sessionId: string) => void;
}

export async function streamChat(opts: ChatStreamOptions & ChatStreamEvent): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/api/chat`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: opts.sessionId,
        message: opts.message,
        model: opts.model,
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    opts.onError(
      __DEV__
        ? `Coach unreachable (${WORKER_URL}) — is it running?`
        : 'Coach service unreachable — check your connection and retry.',
    );
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    opts.onError(`Chat failed (${res.status}): ${text.slice(0, 200)}`);
    return;
  }

  const dispatch: SSEHandler = (msg) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(msg.data || '{}') as Record<string, unknown>;
    } catch {
      return; // malformed frame — skip
    }
    switch (msg.event) {
      case 'start':
        if (typeof data.session_id === 'string' && data.session_id) opts.onSession?.(data.session_id);
        break;
      case 'delta':
        if (typeof data.text === 'string') opts.onDelta(data.text);
        break;
      case 'proposal': {
        // v2: the worker threads the validated tool-arg bundle through the SSE
        // event ({ key, summary } | null) so bundled proposals can group live.
        const bundle = (data.bundle ?? null) as { key?: unknown; summary?: unknown } | null;
        opts.onProposal({
          id: String(data.id ?? ''),
          kind: (data.kind as ProposalKind) ?? 'create_event',
          payload: (data.payload ?? {}) as EventEx,
          rationale: typeof data.rationale === 'string' ? data.rationale : null,
          status: 'pending',
          created: new Date().toISOString(),
          bundleKey: bundle && typeof bundle.key === 'string' ? bundle.key : null,
          bundleSummary: bundle && typeof bundle.summary === 'string' ? bundle.summary : null,
        });
        break;
      }
      case 'done':
        opts.onDone({
          session_id: String(data.session_id ?? ''),
          usage: (data.usage as Record<string, unknown> | null) ?? null,
          proposal_errors: (data.proposal_errors as ChatDone['proposal_errors']) ?? [],
        });
        break;
      case 'error':
        opts.onError(String(data.message ?? 'stream error'));
        break;
      default:
        break; // unknown event types are ignored (forward compat)
    }
  };

  if (res.body) {
    await readSSEResponse(res.body, dispatch);
  } else {
    // Native fetch has no streaming response body — degrade to one-shot parse
    // (all deltas arrive together, proposals still open the modal).
    createSSEParser(dispatch)((await res.text()) + '\n\n');
  }
}

// ---------- proposals ----------

export async function listProposals(status = 'pending'): Promise<Proposal[]> {
  const res = await workerJson<{ items: Array<Record<string, unknown>> }>(
    `/api/proposals?status=${encodeURIComponent(status)}`,
  );
  return (res.items ?? []).map((r) => ({
    id: String(r.id ?? ''),
    kind: (r.kind as ProposalKind) ?? 'create_event',
    payload: (r.payload ?? {}) as EventEx,
    rationale: typeof r.rationale === 'string' ? r.rationale : null,
    status: typeof r.status === 'string' ? r.status : undefined,
    created: typeof r.created === 'string' ? r.created : null,
    bundleKey: typeof r.bundle_key === 'string' && r.bundle_key !== '' ? r.bundle_key : null,
    bundleSummary:
      typeof r.bundle_summary === 'string' && r.bundle_summary !== '' ? r.bundle_summary : null,
  }));
}

export async function applyProposal(id: string): Promise<Proposal> {
  const res = await workerJson<{ ok: boolean; proposal: Record<string, unknown> }>(
    `/api/proposals/${encodeURIComponent(id)}/apply`,
    { method: 'POST' },
  );
  return { ...(res.proposal as unknown as Proposal) };
}

export async function dismissProposal(id: string): Promise<Proposal> {
  const res = await workerJson<{ ok: boolean; proposal: Record<string, unknown> }>(
    `/api/proposals/${encodeURIComponent(id)}/dismiss`,
    { method: 'POST' },
  );
  return { ...(res.proposal as unknown as Proposal) };
}

// ---------- batch proposals (proposal-approval v2 §2) ----------

export interface BatchItemResult {
  id: string;
  ok: boolean;
  status?: string;
  error?: string;
}

export interface BatchOutcome {
  /** true only when EVERY id resolved — partial failures still return results. */
  ok: boolean;
  results: BatchItemResult[];
}

function mapBatchResults(rows: Array<Record<string, unknown>> | undefined): BatchItemResult[] {
  return (rows ?? []).map((r) => ({
    id: String(r.id ?? ''),
    ok: r.ok === true,
    status: typeof r.status === 'string' ? r.status : undefined,
    error: typeof r.error === 'string' ? r.error : undefined,
  }));
}

/**
 * POST /api/proposals/apply-batch — owner-scoped; the worker validates each id
 * belongs to the caller, applies sequentially with the user's own intervals.icu
 * key, and reports per-id results (stops-for-nothing: failures mark the row
 * `failed` and the batch continues). Mirror re-sync happens worker-side.
 *
 * Deploy-window fallback: a worker predating v7 404s the batch routes — those
 * deployments still expose the single-item endpoints, so the bundle sheet must
 * keep working: degrade to sequential single calls and aggregate the same
 * per-id result shape. (The worker-side post-batch mirror re-sync is skipped
 * in that path; the callers' calendar invalidation covers the UI until the
 * next sync.)
 */
export async function applyBatch(ids: string[]): Promise<BatchOutcome> {
  if (!ids.length) return { ok: true, results: [] };
  try {
    const res = await workerJson<{ ok: boolean; results?: Array<Record<string, unknown>> }>(
      '/api/proposals/apply-batch',
      { method: 'POST', body: JSON.stringify({ ids }) },
    );
    return { ok: res.ok === true, results: mapBatchResults(res.results) };
  } catch (e) {
    if (e instanceof WorkerError && e.status === 404) return sequentialBatch(ids, 'apply');
    throw e;
  }
}

/** POST /api/proposals/dismiss-batch — same contract, no intervals.icu writes. */
export async function dismissBatch(ids: string[]): Promise<BatchOutcome> {
  if (!ids.length) return { ok: true, results: [] };
  try {
    const res = await workerJson<{ ok: boolean; results?: Array<Record<string, unknown>> }>(
      '/api/proposals/dismiss-batch',
      { method: 'POST', body: JSON.stringify({ ids }) },
    );
    return { ok: res.ok === true, results: mapBatchResults(res.results) };
  } catch (e) {
    if (e instanceof WorkerError && e.status === 404) return sequentialBatch(ids, 'dismiss');
    throw e;
  }
}

/** Batch semantics over the single-item endpoints (pre-v7 worker fallback). */
async function sequentialBatch(ids: string[], action: 'apply' | 'dismiss'): Promise<BatchOutcome> {
  const results: BatchItemResult[] = [];
  for (const id of ids) {
    try {
      const row = action === 'apply' ? await applyProposal(id) : await dismissProposal(id);
      results.push({ id, ok: true, status: row.status ?? (action === 'apply' ? 'applied' : 'dismissed') });
    } catch (e) {
      results.push({
        id,
        ok: false,
        error: e instanceof WorkerError ? e.message : String(e).slice(0, 200),
      });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

// ---------- sync ----------

export interface SyncResult {
  ok: boolean;
  events?: number;
  activities?: number;
  wellness?: number;
}

export async function triggerSync(): Promise<SyncResult> {
  return workerJson<SyncResult>('/api/sync', { method: 'POST' });
}
