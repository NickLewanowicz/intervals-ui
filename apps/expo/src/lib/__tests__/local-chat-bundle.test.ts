/**
 * local-chat bundle parity (proposal-approval v2 §2): the direct transport
 * must create proposal rows identical to the Worker's — bundle_key /
 * bundle_summary threaded from the validated tool args — and include the
 * bundle on the onProposal payload so the grouped review works on-device.
 * Also locks the §3 cleanup: digest pipe artifacts normalize before storing.
 * lib/pb + lib/keystore mocked; fetch stubbed (same harness as
 * local-chat.test.ts, scoped to the bundle assertions).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;

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
  const collections: Record<string, { getList: Fn; create: Fn; update?: Fn }> = {};
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

import { streamChatDirect, type DirectChatDone, type DirectChatError } from '../local-chat';

const fetchFn = h.mkfn(async () => {
  throw new Error('fetch not stubbed for this URL');
});

/** OpenRouter-style SSE: two bundled update_event tool calls + usage frame. */
function bundledStream(): Response {
  const callA =
    '{"event":{"id":147702969,"start_date_local":"2026-10-28T07:00","name":"Steady aerobic","distance":9000},"rationale":"cut from 9km to 6km","bundle":{"summary":"This week is too much — cut easy volume"}}';
  const callB =
    '{"event":{"id":147703001,"start_date_local":"2026-10-29T07:00","name":"Easy run","description":"Easy run | easy pace","distance":8000},"rationale":"cut from 8km to 5km","bundle":{"summary":"This week is too much — cut easy volume"}}';
  const frames = [
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'update_event', arguments: callA.slice(0, 40) } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: callA.slice(40) } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'update_event', arguments: callB.slice(0, 55) } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: callB.slice(55) } }] } }] })}\n\n`,
    `data: ${JSON.stringify({ usage: { total_tokens: 10 }, choices: [] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');
  const enc = new TextEncoder();
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: enc.encode(frames) };
        },
      }),
    },
    text: async () => frames,
  } as unknown as Response;
}

describe('streamChatDirect — bundled proposals (direct transport parity)', () => {
  beforeEach(() => {
    h.state.record = { id: 'u1', name: 'Nick', units: 'km' }; // not connected → digest defaults
    h.state.orKey = 'sk-or-local';
    h.collections.chat_sessions = {
      getList: h.mkfn(async () => ({ items: [] })),
      create: h.mkfn(async () => ({ id: 'sess-direct' })),
      update: h.mkfn(async () => ({})),
    };
    h.collections.chat_messages = {
      getList: h.mkfn(async () => ({ items: [] })),
      create: h.mkfn(async () => ({ id: 'msg-row' })),
    };
    h.collections.proposals = {
      getList: h.mkfn(async () => ({ items: [] })),
      create: h.mkfn(async () => ({ id: 'prop-row' })),
    };
    vi.stubGlobal('fetch', fetchFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores bundle_key/bundle_summary on both rows and emits the bundle onProposal', async () => {
    fetchFn.impl = bundledStream;
    const proposals: unknown[] = [];
    let done: DirectChatDone | null = null;
    let error: DirectChatError | null = null;
    await streamChatDirect({
      message: 'This week is too much — cut Wednesday and Thursday',
      onDelta: () => undefined,
      onProposal: (p) => proposals.push(p),
      onDone: (d) => (done = d),
      onError: (e) => (error = e),
    });

    expect(error).toBeNull();
    expect((done as unknown as DirectChatDone).usedFallback).toBe(false); // direct path, no fallback

    const creates = h.collections.proposals!.create.calls;
    expect(creates).toHaveLength(2);
    const expectedKey = 'this-week-is-too-much-cut-easy-volume'; // validateProposal's normalization
    for (const [row] of creates) {
      expect(row.bundle_key).toBe(expectedKey);
      expect(row.bundle_summary).toBe('This week is too much — cut easy volume');
      expect(row.status).toBe('pending');
    }

    expect(proposals).toHaveLength(2);
    for (const p of proposals as Array<Record<string, unknown>>) {
      expect(p.bundleKey).toBe(expectedKey);
      expect(p.bundleSummary).toBe('This week is too much — cut easy volume');
      expect(p.status).toBe('pending');
    }
  });

  it('normalizes digest pipe artifacts out of the stored description (v2 §3)', async () => {
    fetchFn.impl = bundledStream;
    await streamChatDirect({
      message: 'trim the week',
      onDelta: () => undefined,
      onProposal: () => undefined,
      onDone: () => undefined,
      onError: () => undefined,
    });
    const [, second] = h.collections.proposals!.create.calls;
    const payload = (second![0] as { payload: { description?: string } }).payload;
    expect(payload.description).toBe('Easy run\neasy pace');
    expect(payload.description).not.toContain('|');
  });
});
