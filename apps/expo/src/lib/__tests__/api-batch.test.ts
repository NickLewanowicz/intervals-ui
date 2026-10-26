/**
 * api.ts batch wrappers (proposal-approval v2 §2): applyBatch / dismissBatch
 * POST the id array to the worker's owner-scoped batch endpoints and surface
 * the per-id results verbatim; HTTP failures throw WorkerError with the
 * body's error detail. global fetch is stubbed; lib/pb is mocked.
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

import { applyBatch, dismissBatch, WorkerError } from '../api';

const BASE = 'https://intervals-coach.imnick.workers.dev';

let fetchImpl: (url: unknown, init?: RequestInit) => Promise<unknown>;

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

describe('applyBatch / dismissBatch', () => {
  beforeEach(() => {
    fetchImpl = async () => {
      throw new Error('fetch not stubbed');
    };
    vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => fetchImpl(String(url), init));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts {ids} to apply-batch with the PB bearer and returns per-id results', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    fetchImpl = async (url, init) => {
      seenUrl = url as string;
      seenInit = init;
      return jsonResponse({
        ok: false,
        results: [
          { id: 'p1', ok: true, status: 'applied', intervals_event_id: 42 },
          { id: 'p2', ok: false, error: 'upstream 4xx' },
        ],
      });
    };
    const outcome = await applyBatch(['p1', 'p2']);
    expect(seenUrl).toBe(`${BASE}/api/proposals/apply-batch`);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toMatchObject({ Authorization: 'Bearer pb-token' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({ ids: ['p1', 'p2'] });
    // ok=false is honest: only EVERY id applied counts
    expect(outcome.ok).toBe(false);
    expect(outcome.results).toEqual([
      { id: 'p1', ok: true, status: 'applied', error: undefined },
      { id: 'p2', ok: false, status: undefined, error: 'upstream 4xx' },
    ]);
  });

  it('posts {ids} to dismiss-batch', async () => {
    let seenUrl = '';
    fetchImpl = async (url) => {
      seenUrl = url as string;
      return jsonResponse({ ok: true, results: [{ id: 'p9', ok: true, status: 'dismissed' }] });
    };
    const outcome = await dismissBatch(['p9']);
    expect(seenUrl).toBe(`${BASE}/api/proposals/dismiss-batch`);
    expect(outcome).toEqual({
      ok: true,
      results: [{ id: 'p9', ok: true, status: 'dismissed', error: undefined }],
    });
  });

  it('throws WorkerError with the body detail on HTTP failure', async () => {
    fetchImpl = async () => jsonResponse({ error: 'ids_required_1_to_25' }, false, 400);
    await expect(applyBatch(['p1', 'p2'])).rejects.toMatchObject({
      name: 'WorkerError',
      status: 400,
      message: 'ids_required_1_to_25',
    });
  });

  it('skips the network for empty id lists (button is disabled anyway)', async () => {
    fetchImpl = async () => {
      throw new Error('must not fetch');
    };
    await expect(applyBatch([])).resolves.toEqual({ ok: true, results: [] });
    await expect(dismissBatch([])).resolves.toEqual({ ok: true, results: [] });
  });

  it('falls back to sequential single calls when the worker predates the batch routes (404)', async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    fetchImpl = async (url, init) => {
      const u = url as string;
      if (u.endsWith('-batch')) {
        calls.push({ url: u });
        return jsonResponse({ error: 'not_found' }, false, 404);
      }
      calls.push({ url: u, body: undefined });
      const id = u.match(/\/api\/proposals\/([\w]+)\/(apply|dismiss)/)![1]!;
      return jsonResponse({
        ok: true,
        proposal: { id, status: init?.method === 'POST' && u.endsWith('/apply') ? 'applied' : 'dismissed' },
      });
    };
    const outcome = await dismissBatch(['p1', 'p2']);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/proposals/dismiss-batch`,
      `${BASE}/api/proposals/p1/dismiss`,
      `${BASE}/api/proposals/p2/dismiss`,
    ]);
    expect(outcome).toEqual({
      ok: true,
      results: [
        { id: 'p1', ok: true, status: 'dismissed', error: undefined },
        { id: 'p2', ok: true, status: 'dismissed', error: undefined },
      ],
    });
  });

  it('aggregate fallback stays honest: a failed single call fails the batch', async () => {
    fetchImpl = async (url, init) => {
      const u = url as string;
      if (u.endsWith('-batch')) return jsonResponse({ error: 'not_found' }, false, 404);
      if (u.includes('p2')) return jsonResponse({ error: 'upstream 4xx' }, false, 500);
      const id = u.match(/\/api\/proposals\/([\w]+)\/apply/)![1]!;
      return jsonResponse({ ok: true, proposal: { id, status: 'applied' } });
    };
    const outcome = await applyBatch(['p1', 'p2']);
    expect(outcome.ok).toBe(false);
    expect(outcome.results[0]).toMatchObject({ id: 'p1', ok: true, status: 'applied' });
    expect(outcome.results[1]).toMatchObject({ id: 'p2', ok: false });
  });

  it('non-404 batch failures still throw (no silent degradation)', async () => {
    fetchImpl = async (url) => {
      if ((url as string).endsWith('-batch')) return jsonResponse({ error: 'ids_required_1_to_25' }, false, 400);
      throw new Error('must not reach single endpoints');
    };
    await expect(applyBatch(['p1'])).rejects.toMatchObject({ name: 'WorkerError', status: 400 });
  });
});

describe('WorkerError via unreachable worker', () => {
  it('maps a rejected fetch to a status-0 WorkerError', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('network down')));
    await expect(dismissBatch(['p1'])).rejects.toBeInstanceOf(WorkerError);
    vi.unstubAllGlobals();
  });
});
