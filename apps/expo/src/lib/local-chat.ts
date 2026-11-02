/**
 * Direct client→OpenRouter chat transport (ADR-0006 hybrid chat).
 *
 * Builds EXACTLY the request the Worker's /api/chat handler builds — same
 * mirror windows (calendar_events −21d→+90d, activities −21d→today, wellness
 * 14d, sport_settings), same shared digests from @intervals/core, same
 * system prompt, same 20-message history — but calls the LLM from the
 * client with the locally stored key (lib/keystore.ts) — OpenRouter by
 * default, or the user's OpenAI-compatible base (`llm_base_url`, round 23) —
 * and persists the chat/proposal rows itself via the PB owner-create rules.
 *
 * Fallback contract: when there is no local key, or the direct fetch fails
 * BEFORE any delta has streamed, the turn transparently re-runs through the
 * Worker path (lib/api.ts streamChat) and every terminal callback reports
 * `usedFallback: true`. intervals.icu is NEVER called here; proposal
 * apply/dismiss stays Worker-only.
 */
import {
  COACH_TOOLS,
  chatUrlFor,
  ProposalValidationError,
  buildCoachSystemPrompt,
  calendarDigest,
  openRouterFetchInit,
  resolveModel,
  validateProposal,
  vdotDigest,
  wellnessDigest,
  zonesDigest,
} from '@intervals/core';
import type {
  MirrorActivity,
  MirrorEvent,
  MirrorWellness,
  OpenRouterMessage,
} from '@intervals/core';
import { streamChat, type ChatDone, type ChatStreamOptions } from './api';
import { titleFromMessage } from './chat-sessions';
import { getLocalOrKey } from './keystore';
import { pb } from './pb';
import type { Proposal, ProposalKind } from './records';
import { createSSEParser, readSSEResponse, type SSEHandler } from './sse';

// ---------- pure tool-call accumulation (unit tested) ----------

/** One `tool_calls` fragment as OpenRouter streams it (wire-shape subset). */
export interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export interface AccumulatedToolCall {
  id: string;
  name: string;
  args: string;
}

/**
 * Merge streamed tool-call fragments into whole calls — exactly the Worker's
 * accumulation semantics: fragments carry an `index`; `id` is SET when
 * present (last one wins), `function.name`/`function.arguments` are APPENDED
 * across fragments of the same index (arguments arrive split mid-JSON).
 * Result is ordered by index; fragment-less slots never occur.
 */
export function accumulateToolCalls(deltas: Iterable<ToolCallDelta>): AccumulatedToolCall[] {
  const byIndex = new Map<number, AccumulatedToolCall>();
  for (const tc of deltas) {
    const idx = tc.index ?? 0;
    const cur = byIndex.get(idx) ?? { id: '', name: '', args: '' };
    if (tc.id) cur.id = tc.id;
    if (tc.function?.name) cur.name += tc.function.name;
    if (tc.function?.arguments) cur.args += tc.function.arguments;
    byIndex.set(idx, cur);
  }
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => call);
}

// ---------- client-side session + context (mirrors the Worker) ----------

const HISTORY_MESSAGES = 20; // same window the Worker sends

/** Bump the session's last-activity stamp (the sessions-list sort key). */
async function bumpSessionActivity(sessionId: string): Promise<void> {
  await pb.collection('chat_sessions').update(sessionId, {
    last_message_at: new Date().toISOString(),
  });
}

/** Create a chat session row as the owner (rule allows owner-create). */
export async function createSessionDirect(
  userId: string,
  message: string,
  model?: string,
): Promise<string> {
  const row = await pb.collection('chat_sessions').create({
    user: userId,
    title: titleFromMessage(message),
    last_message_at: new Date().toISOString(),
    ...(model ? { model } : {}),
  });
  return String(row.id);
}

/**
 * Complete tool calls only: id + name accumulated AND arguments that parse as
 * JSON. An abort mid-stream can cut a call's argument JSON in half — those
 * fragments are dropped, never turned into proposals (unit tested).
 */
export function completeToolCalls(calls: AccumulatedToolCall[]): AccumulatedToolCall[] {
  return calls.filter((c) => {
    if (!c.id || !c.name) return false;
    try {
      JSON.parse(c.args || '{}');
      return true;
    } catch {
      return false;
    }
  });
}

type PbRow = Record<string, unknown>;

function userRecord(): PbRow {
  const record = pb.authStore.record;
  if (!record?.id) throw new Error('Not signed in');
  return record as unknown as PbRow;
}

/**
 * Build the same system prompt the Worker builds, from the PB mirrors
 * directly. Windows/filters are copied from the Worker's /api/chat handler
 * so both transports produce identical prompts from identical rows.
 */
async function buildSystemPromptDirect(userId: string): Promise<string> {
  const record = userRecord();
  const connected = typeof record.intervals_athlete_id === 'string' && record.intervals_athlete_id !== '';
  const now = new Date();

  let calDigest = '(no intervals.icu account connected — ask the athlete to connect one in Settings; you can still talk training)';
  let wellDigest = '(no wellness data)';
  let zDigest = '(no zone settings)';
  let vDigest: string | null = null;

  if (connected) {
    // hidden fields (api keys) are invisible to regular auth — connectedness
    // is proxied by the athlete id; unsynced mirrors degrade inside the digests
    const back = new Date(now.getTime() - 21 * 86400_000).toISOString().slice(0, 10);
    const fwd = new Date(now.getTime() + 90 * 86400_000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const byUser = `user = "${userId}"`;
    const [evRes, acRes, wRes, zRes] = await Promise.all([
      pb.collection('calendar_events').getList(1, 300, {
        filter: `${byUser} && start_date_local >= "${back}T00:00:00" && start_date_local <= "${fwd}T23:59:59"`,
        sort: 'start_date_local',
      }),
      pb.collection('activities').getList(1, 150, {
        filter: `${byUser} && start_date_local >= "${back}T00:00:00" && start_date_local <= "${today}T23:59:59"`,
        sort: '-start_date_local',
      }),
      pb.collection('wellness').getList(1, 14, { filter: byUser, sort: '-date' }),
      pb.collection('sport_settings').getList(1, 1, { filter: byUser }),
    ]);

    // spread the upstream `data` json + overlay the mirror column — the exact
    // shapes the Worker feeds the digests
    const events: MirrorEvent[] = evRes.items.map((r) => ({
      ...((r.data ?? {}) as object),
      intervals_id: (r.intervals_id as number | null) ?? undefined,
    }));
    const activities: MirrorActivity[] = acRes.items.map((r) => (r.data ?? {}) as object);
    const wellness: MirrorWellness[] = wRes.items.map((r) => ({
      ...((r.data ?? {}) as object),
      date: (r.date as string | null) ?? undefined,
    }));
    const sportRow: PbRow | undefined = zRes.items[0] as PbRow | undefined;

    calDigest = calendarDigest(events, activities);
    wellDigest = wellnessDigest(wellness);
    zDigest = zonesDigest((sportRow?.data as never) ?? null);
    vDigest = vdotDigest(activities, now);
  }

  return buildCoachSystemPrompt({
    athleteName: record.name as string | undefined,
    today: now.toISOString().slice(0, 10),
    units: record.units === 'mi' ? 'mi' : 'km',
    calendarDigest: calDigest,
    wellnessDigest: wellDigest,
    zonesDigest: zDigest,
    vdotDigest: vDigest ?? undefined,
    athleteProfile: (record.athlete_profile as string | undefined) ?? '',
  });
}

async function historyDirect(sessionId: string): Promise<OpenRouterMessage[]> {
  const res = await pb
    .collection('chat_messages')
    .getList(1, 100, { filter: `session = "${sessionId}"`, sort: 'created' });
  return res.items
    .slice(-HISTORY_MESSAGES)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: String(m.content ?? ''),
    }));
}

// ---------- the transport ----------

export interface DirectChatDone extends ChatDone {
  /** true when the turn actually ran via the Worker fallback. */
  usedFallback: boolean;
}

export interface DirectChatError {
  message: string;
  /** true when this error came from the Worker fallback path. */
  usedFallback: boolean;
}

export interface StreamChatDirectOptions extends ChatStreamOptions {
  onDelta: (text: string) => void;
  onProposal: (p: Proposal) => void;
  onDone: (d: DirectChatDone) => void;
  onError: (e: DirectChatError) => void;
  /** Fires as soon as the session id is known (kept across client-side aborts). */
  onSession?: (sessionId: string) => void;
}

/** Re-run the turn through the Worker path, reporting the fallback. */
async function runViaWorker(opts: StreamChatDirectOptions, sessionId = opts.sessionId): Promise<void> {
  await streamChat({
    sessionId,
    message: opts.message,
    model: opts.model,
    signal: opts.signal,
    onDelta: opts.onDelta,
    onProposal: opts.onProposal,
    onSession: opts.onSession,
    onDone: (d) => opts.onDone({ ...d, usedFallback: true }),
    onError: (message) => opts.onError({ message, usedFallback: true }),
  });
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

/**
 * Client-first chat turn. Falls back to the Worker (transparent to the UI,
 * flagged in the terminal callbacks) when no local key exists or the direct
 * fetch fails before any delta has streamed.
 */
export async function streamChatDirect(opts: StreamChatDirectOptions): Promise<void> {
  const apiKey = await getLocalOrKey();
  if (!apiKey) return runViaWorker(opts); // new device / key not saved locally

  let sessionId = opts.sessionId;
  let system: string;
  let priorMessages: OpenRouterMessage[] = [];
  let model: string | undefined;
  // round 23: the user's OpenAI-compatible base (Settings → API base URL).
  // Empty/absent → OpenRouter. Only the DIRECT path honors it; the Worker
  // fallback stays OpenRouter-only.
  let customBase = '';
  try {
    const record = userRecord();
    const userId = String(record.id);
    model = opts.model ?? (record.preferred_model as string | undefined);
    customBase = typeof record.llm_base_url === 'string' ? record.llm_base_url.trim() : '';
    system = await buildSystemPromptDirect(userId);
    if (sessionId) priorMessages = await historyDirect(sessionId);
  } catch (e) {
    if (isAbort(e)) return;
    return runViaWorker(opts); // context failed pre-stream — Worker builds its own
  }

  if (!sessionId) {
    try {
      sessionId = await createSessionDirect(String(userRecord().id), opts.message, model);
    } catch (e) {
      if (isAbort(e)) return;
      return runViaWorker(opts);
    }
  }
  opts.onSession?.(sessionId);

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: system },
    ...priorMessages,
    { role: 'user', content: opts.message },
  ];

  let res: Response;
  try {
    res = await fetch(
      chatUrlFor(customBase),
      openRouterFetchInit({
        apiKey,
        model: resolveModel(model),
        messages,
        tools: COACH_TOOLS,
        stream: true,
        signal: opts.signal,
        // strict OpenAI-compatible servers 400 on OpenRouter's `provider`/
        // `reasoning` body extras — omit them whenever a custom base is set
        compatible: customBase !== '',
      }),
    );
  } catch (e) {
    if (isAbort(e)) return;
    return runViaWorker(opts, sessionId); // network/CORS failure before any delta
  }
  if (!res.ok) {
    await res.text().catch(() => ''); // drain — the error detail stays local
    return runViaWorker(opts, sessionId); // HTTP failure (bad key upstream, 4xx/5xx)
  }

  // Direct path is committed from here: persist the turn, stream, persist.
  const userId = String(userRecord().id);
  try {
    await pb.collection('chat_messages').create({
      session: sessionId,
      user: userId,
      role: 'user',
      content: opts.message,
    });
    await bumpSessionActivity(sessionId);
  } catch (e) {
    if (isAbort(e)) return;
    // non-fatal: the in-memory turn still streams; history may lose this row
  }

  let full = '';
  let usage: Record<string, unknown> | null = null;
  const toolDeltas: ToolCallDelta[] = [];

  const dispatch: SSEHandler = (msg) => {
    if (msg.event !== 'message') return; // OpenRouter frames use the default event
    const payload = msg.data.trim();
    if (!payload || payload === '[DONE]') return;
    let chunk: {
      usage?: Record<string, unknown>;
      choices?: Array<{ delta?: { content?: string; tool_calls?: ToolCallDelta[] } }>;
    };
    try {
      chunk = JSON.parse(payload);
    } catch {
      return; // malformed frame — skip
    }
    if (chunk.usage) usage = chunk.usage;
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) {
      full += delta.content;
      opts.onDelta(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) toolDeltas.push(...delta.tool_calls);
  };

  let aborted = opts.signal?.aborted === true;
  try {
    if (res.body) {
      await readSSEResponse(res.body, dispatch);
    } else {
      // native fetch without a streaming body — one-shot parse (same as api.ts)
      createSSEParser(dispatch)((await res.text()) + '\n\n');
    }
  } catch (e) {
    if (!isAbort(e) && !opts.signal?.aborted) {
      opts.onError({ message: `Chat stream failed: ${String(e).slice(0, 200)}`, usedFallback: false });
      return;
    }
    aborted = true; // stop pressed: fall through and keep the partial
  }
  if (opts.signal?.aborted) aborted = true;

  const toolCalls = accumulateToolCalls(toolDeltas);
  // a cut-off call's argument JSON may be half a string — persist/propose only
  // COMPLETE calls (the full stream end already guarantees completeness)
  const persistableCalls = aborted ? completeToolCalls(toolCalls) : toolCalls;

  // persist the assistant message (full reply OR partial after a stop — the
  // transcript survives the trip back; same shape the Worker writes)
  try {
    if (full || persistableCalls.length) {
      await pb.collection('chat_messages').create({
        session: sessionId,
        user: userId,
        role: 'assistant',
        content: full,
        tool_calls: persistableCalls.length
          ? persistableCalls.map((t) => ({ id: t.id, function: { name: t.name, arguments: t.args } }))
          : null,
        usage,
      });
      await bumpSessionActivity(sessionId);
    }
  } catch (e) {
    if (isAbort(e)) return;
    // non-fatal: the reply already rendered; only history persistence failed
  }

  // tool calls → proposal rows (validated; invalid ones reported, not fatal)
  const proposalErrors: Array<{ tool: string; error: string }> = [];
  for (const tc of persistableCalls) {
    if (!tc.name) continue;
    let args: unknown;
    try {
      args = JSON.parse(tc.args || '{}');
    } catch {
      proposalErrors.push({ tool: tc.name, error: 'unparseable tool arguments' });
      continue;
    }
    try {
      const { kind, payload, rationale, bundle } = validateProposal(tc.name, args);
      // v2 §3 cleanup (parity with the worker): normalize digest pipe artifacts
      // BEFORE storing so the raw text never shows "…| |…" concatenation.
      if (typeof payload.description === 'string') {
        payload.description = payload.description.replace(/\s*\|\s*/g, '\n');
      }
      // bundle parity: the worker stores bundle_key/bundle_summary from the
      // validated args — the direct transport must create identical rows.
      const row = await pb.collection('proposals').create({
        user: userId,
        session: sessionId,
        kind,
        payload,
        rationale: rationale ?? null,
        status: 'pending',
        bundle_key: bundle?.key ?? null,
        bundle_summary: bundle?.summary ?? null,
      });
      // a stopped turn still persists its proposal (row above) but must not
      // pop the modal — the inline card + post-turn refresh surface it.
      // BUG #17: the row is the source of truth for the id — an id-less
      // proposal event would open a modal whose Approve POSTs
      // `/api/proposals//apply` (404). If the row id is missing, skip the
      // event entirely; the post-turn refresh surfaces the row (or its
      // absence) instead of a dead-end modal.
      const rowId = String(row.id ?? '');
      if (!aborted && rowId) {
        opts.onProposal({
          id: rowId,
          kind: kind as ProposalKind,
          payload: payload as Proposal['payload'],
          rationale: rationale ?? null,
          status: 'pending',
          created: new Date().toISOString(),
          bundleKey: bundle?.key ?? null,
          bundleSummary: bundle?.summary ?? null,
        });
      }
    } catch (e) {
      if (e instanceof ProposalValidationError) {
        proposalErrors.push({ tool: tc.name, error: e.message });
      } else if (!isAbort(e)) {
        proposalErrors.push({ tool: tc.name, error: String(e).slice(0, 200) });
      }
    }
  }

  if (aborted) return; // stop: partial persisted above — no done/error event

  if (!full && !toolCalls.length && !usage) {
    opts.onError({ message: 'Coach returned an empty response — try again.', usedFallback: false });
    return;
  }

  opts.onDone({
    session_id: sessionId,
    usage,
    proposal_errors: proposalErrors,
    usedFallback: false,
  });
}
