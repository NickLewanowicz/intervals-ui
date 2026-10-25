/**
 * local-chat (ADR-0006 direct transport) tests:
 *  - accumulateToolCalls: pure index-merged tool-call accumulation
 *  - streamChatDirect: direct happy path (persist + proposal rows),
 *    fallback to the Worker when the key is missing, the fetch rejects,
 *    or OpenRouter answers non-2xx — all BEFORE any delta.
 *
 * lib/pb and lib/keystore are mocked; global fetch is stubbed per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  // lib/api.ts reads __DEV__ at module scope — define it before any import
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;

  /** Minimal recording function mock (vi.fn is unavailable in hoisted scope). */
  type Fn = ((...args: any[]) => any) & { impl?: (...args: any[]) => any; calls: any[][] };
  const mkfn =
    (impl: (...args: any[]) => any = async () => undefined): Fn => {
      const calls: any[][] = [];
      const f = ((...args: any[]) => {
        calls.push(args);
        return f.impl!(...args);
      }) as Fn;
      f.impl = impl;
      f.calls = calls;
      return f;
    };

  const state = { record: {} as Record<string, unknown>, orKey: null as string | null };
  const collections: Record<string, { getList: Fn; create: Fn }> = {};
  const pb = {
    authStore: {
      isValid: true,
      token: 'pb-token',
      get record() {
        return state.record.id ? state.record : null;
      },
    },
    collection: (name: string) => {
      const c = collections[name] ?? (collections[name] = {
        getList: mkfn(async () => ({ items: [] })),
        create: mkfn(async () => ({ id: `${name}-row` })),
      });
      return c;
    },
  };
  return { state, collections, pb, mkfn };
});

vi.mock('@/lib/pb', () => ({
  pb: h.pb,
  currentUserId: () => (h.state.record.id ? String(h.state.record.id) : null),
  authToken: () => 'pb-token',
}));
vi.mock('@/lib/keystore', () => ({
  getLocalOrKey: async () => h.state.orKey,
  setLocalOrKey: async () => undefined,
  clearLocalOrKey: async () => undefined,
}));

import { OPENROUTER_CHAT_URL } from '@intervals/core';
import {
  accumulateToolCalls,
  streamChatDirect,
  type DirectChatDone,
  type DirectChatError,
} from '../local-chat';

const WORKER_CHAT = 'https://intervals-coach.imnick.workers.dev/api/chat';

/** Encode `data:` frames (OpenRouter style: no event field). */
const orFrames = (objs: unknown[]) =>
  objs.map((o) => `data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`).join('');

/** Encode `event:`+`data:` frames (worker style). */
const workerFrames = (frames: Array<[string, unknown]>) =>
  frames.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');

function sseResponse(text: string, ok = true, status = 200): Response {
  const enc = new TextEncoder();
  let sent = false;
  return {
    ok,
    status,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: enc.encode(text) };
        },
      }),
    },
    text: async () => text,
  } as unknown as Response;
}

const fetchFn = h.mkfn(async () => {
  throw new Error('fetch not stubbed for this URL');
});

describe('accumulateToolCalls', () => {
  it('merges argument fragments split across deltas at the same index', () => {
    const calls = accumulateToolCalls([
      { index: 0, id: 'call_1', function: { name: 'propose_event', arguments: '{"start_date_local":"2026-10-30T07:00",' } },
      { index: 0, function: { arguments: '"name":"Easy"}' } },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.id).toBe('call_1');
    expect(calls[0]!.name).toBe('propose_event');
    expect(JSON.parse(calls[0]!.args)).toEqual({
      start_date_local: '2026-10-30T07:00',
      name: 'Easy',
    });
  });

  it('keeps calls ordered by index and appends name fragments', () => {
    const calls = accumulateToolCalls([
      { index: 1, id: 'call_b', function: { name: 'update_', arguments: '{"id":2}' } },
      { index: 0, id: 'call_a', function: { name: 'propose_', arguments: '{}' } },
      { index: 1, function: { name: 'event', arguments: '' } },
      { index: 0, function: { name: 'event', arguments: '' } },
    ]);
    expect(calls.map((c) => c.id)).toEqual(['call_a', 'call_b']);
    expect(calls.map((c) => c.name)).toEqual(['propose_event', 'update_event']);
  });

  it('defaults a missing index to 0 and yields nothing for no fragments', () => {
    expect(accumulateToolCalls([])).toEqual([]);
    expect(accumulateToolCalls([{ id: 'x', function: { name: 'delete_event', arguments: '{"id":9}' } }])).toEqual([
      { id: 'x', name: 'delete_event', args: '{"id":9}' },
    ]);
  });
});

describe('streamChatDirect', () => {
  beforeEach(() => {
    h.state.record = {
      id: 'u1',
      name: 'Nick',
      units: 'km',
      athlete_profile: 'marathon in 12 weeks',
      preferred_model: '',
      intervals_athlete_id: 'i123', // connected → mirror queries run
    };
    h.state.orKey = null;
    h.collections.chat_sessions = {
      getList: h.mkfn(async () => ({ items: [] })),
      create: h.mkfn(async () => ({ id: 'sess-direct' })),
    };
    h.collections.chat_messages = {
      getList: h.mkfn(async () => ({ items: [] })),
      create: h.mkfn(async () => ({ id: 'msg-row' })),
    };
    h.collections.proposals = {
      getList: h.mkfn(async () => ({ items: [] })),
      create: h.mkfn(async () => ({ id: 'prop-row' })),
    };
    for (const c of ['calendar_events', 'activities', 'wellness', 'sport_settings']) {
      h.collections[c] = { getList: h.mkfn(async () => ({ items: [] })), create: h.mkfn() };
    }
    vi.stubGlobal('fetch', fetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const callbacks = () => {
    const out = {
      deltas: [] as string[],
      proposals: [] as unknown[],
      done: null as DirectChatDone | null,
      error: null as DirectChatError | null,
    };
    return {
      out,
      opts: (over: Partial<Parameters<typeof streamChatDirect>[0]> = {}) => ({
        message: 'Add an easy run Friday',
        onDelta: (t: string) => out.deltas.push(t),
        onProposal: (p: unknown) => out.proposals.push(p),
        onDone: (d: DirectChatDone) => (out.done = d),
        onError: (e: DirectChatError) => (out.error = e),
        ...over,
      }),
    };
  };

  it('streams direct, persists both messages and creates the proposal row', async () => {
    h.state.orKey = 'sk-or-local';
    const toolArgs = JSON.stringify({
      start_date_local: '2026-10-30T07:00',
      name: 'Easy shakeout',
      type: 'Run',
      moving_time: 1200,
      rationale: 'Recovery after Friday quality',
    });
    fetchFn.impl = async (url: string, init?: RequestInit) => {
      if (String(url) !== OPENROUTER_CHAT_URL) throw new Error('unexpected URL ' + url);
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer sk-or-local' });
      const body = JSON.parse(String(init?.body));
      expect(body.stream).toBe(true);
      expect(body.tools?.length).toBeGreaterThan(0);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'Add an easy run Friday' });
      expect(body.messages[0].content).toContain('Nick');
      return sseResponse(
        orFrames([
          { choices: [{ delta: { content: 'Easy ' } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'propose_event', arguments: '' } }] } }] },
          { choices: [{ delta: { content: 'done.' } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: toolArgs.slice(0, 20) } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: toolArgs.slice(20) } }] } }] },
          { choices: [{ delta: {} }], usage: { total_tokens: 42 } },
          '[DONE]',
        ]),
      );
    };

    const { out, opts } = callbacks();
    await streamChatDirect(opts());
    expect(out.error).toBeNull();
    expect(out.deltas.join('')).toBe('Easy done.');
    expect(out.done?.usedFallback).toBe(false);
    expect(out.done?.session_id).toBe('sess-direct');
    expect(out.done?.usage).toEqual({ total_tokens: 42 });
    expect(out.done?.proposal_errors).toEqual([]);

    // context windows hit the mirrors with the same owner-scoped filters
    const calArgs = h.collections.calendar_events.getList.calls[0]!;
    expect(calArgs[0]).toBe(1);
    expect(calArgs[1]).toBe(300);
    expect(calArgs[2].filter).toContain('user = "u1" && start_date_local >=');

    // user message persisted before the assistant row
    const msgRows = h.collections.chat_messages.create.calls.map((c) => c[0]);
    expect(msgRows[0]).toMatchObject({ session: 'sess-direct', user: 'u1', role: 'user', content: 'Add an easy run Friday' });
    expect(msgRows[1]).toMatchObject({ session: 'sess-direct', user: 'u1', role: 'assistant', content: 'Easy done.' });
    expect(msgRows[1].tool_calls).toEqual([
      { id: 'call_1', function: { name: 'propose_event', arguments: toolArgs } },
    ]);

    // proposal row created as pending with the validated payload
    expect(h.collections.proposals.create.calls[0]![0]).toMatchObject({
      user: 'u1',
      session: 'sess-direct',
      kind: 'create_event',
      status: 'pending',
    });
    expect(h.collections.proposals.create.calls[0]![0].payload).toMatchObject({
      start_date_local: '2026-10-30T07:00',
      name: 'Easy shakeout',
    });
    expect(out.proposals[0]).toMatchObject({ id: 'prop-row', kind: 'create_event', status: 'pending' });
  });

  it('falls back to the worker when no local key exists', async () => {
    h.state.orKey = null;
    fetchFn.impl = async (url: string) => {
      expect(String(url)).toBe(WORKER_CHAT);
      return sseResponse(workerFrames([['delta', { text: 'hi' }], ['done', { session_id: 'w-sess', usage: null, proposal_errors: [] }]]));
    };
    const { out, opts } = callbacks();
    await streamChatDirect(opts());
    expect(out.deltas).toEqual(['hi']);
    expect(out.done).toMatchObject({ session_id: 'w-sess', usedFallback: true });
    // nothing was persisted client-side on the fallback path
    expect(h.collections.chat_messages.create.calls).toHaveLength(0);
    expect(h.collections.proposals.create.calls).toHaveLength(0);
  });

  it('falls back when the direct fetch rejects before any delta (no dup rows)', async () => {
    h.state.orKey = 'sk-or-local';
    fetchFn.impl = async (url: string) => {
      if (String(url) === OPENROUTER_CHAT_URL) throw new TypeError('network down');
      expect(String(url)).toBe(WORKER_CHAT);
      return sseResponse(workerFrames([['done', { session_id: 'w-sess', usage: null, proposal_errors: [] }]]));
    };
    const { out, opts } = callbacks();
    await streamChatDirect(opts());
    expect(out.done).toMatchObject({ session_id: 'w-sess', usedFallback: true });
    expect(h.collections.chat_messages.create.calls).toHaveLength(0);
  });

  it('falls back when OpenRouter answers non-2xx', async () => {
    h.state.orKey = 'sk-or-local';
    fetchFn.impl = async (url: string) => {
      if (String(url) === OPENROUTER_CHAT_URL) return sseResponse('{"error":{"message":"bad key"}}', false, 401);
      return sseResponse(workerFrames([['done', { session_id: 'w-sess', usage: null, proposal_errors: [] }]]));
    };
    const { out, opts } = callbacks();
    await streamChatDirect(opts());
    expect(out.done?.usedFallback).toBe(true);
  });

  it('reports invalid tool calls on the done event instead of throwing', async () => {
    h.state.orKey = 'sk-or-local';
    fetchFn.impl = async () =>
      sseResponse(
        orFrames([
          { choices: [{ delta: { content: 'Trying.' } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'delete_event', arguments: '{"id":null}' } }] } }] },
          { choices: [{ delta: {} }], usage: { total_tokens: 5 } },
          '[DONE]',
        ]),
      );
    const { out, opts } = callbacks();
    await streamChatDirect(opts());
    expect(out.proposals).toHaveLength(0);
    expect(out.done?.usedFallback).toBe(false);
    expect(out.done?.proposal_errors?.[0]).toMatchObject({ tool: 'delete_event' });
    expect(h.collections.proposals.create.calls).toHaveLength(0);
  });
});
