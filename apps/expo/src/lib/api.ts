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

export const WORKER_URL = process.env.EXPO_PUBLIC_WORKER_URL ?? 'http://localhost:8787';

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
    throw new WorkerError(0, `Worker unreachable (${WORKER_URL}) — is it running?`);
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
    opts.onError(`Coach unreachable (${WORKER_URL}) — is it running?`);
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
      case 'delta':
        if (typeof data.text === 'string') opts.onDelta(data.text);
        break;
      case 'proposal':
        opts.onProposal({
          id: String(data.id ?? ''),
          kind: (data.kind as ProposalKind) ?? 'create_event',
          payload: (data.payload ?? {}) as EventEx,
          rationale: typeof data.rationale === 'string' ? data.rationale : null,
          status: 'pending',
        });
        break;
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
