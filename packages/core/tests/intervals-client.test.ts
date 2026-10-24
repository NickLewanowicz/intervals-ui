import { describe, expect, it, vi } from 'vitest';
import { createIntervalsClient, IntervalsApiError } from '../src/intervals-client';

function recordingFetch(capture: Array<{ url: string; init: RequestInit }>) {
  return (async (url: string | URL, init?: RequestInit) => {
    capture.push({ url: String(url), init: init ?? {} });
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('createIntervalsClient', () => {
  it('authenticates with the API_KEY:<key> basic scheme and a browser UA', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const client = createIntervalsClient({
      apiKey: 'k123',
      athleteId: 'i167187',
      fetchImpl: recordingFetch(seen),
    });
    await client.events(new Date('2026-10-01T00:00:00Z'), '2026-10-24');
    const [call] = seen;
    const headers = call!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Basic ' + btoa('API_KEY:k123'));
    expect(headers['User-Agent']).toMatch(/Mozilla/);
    expect(call!.url).toContain('/athlete/i167187/events?oldest=2026-10-01&newest=2026-10-24');
  });

  it('defaults athlete id to 0 (self)', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const client = createIntervalsClient({ apiKey: 'k', fetchImpl: recordingFetch(seen) });
    await client.sportSettings();
    expect(seen[0]!.url).toContain('/athlete/0/sport-settings');
  });

  it('createEvent posts EventEx with upsertOnUid', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const client = createIntervalsClient({ apiKey: 'k', fetchImpl: recordingFetch(seen) });
    await client.createEvent({ start_date_local: '2026-11-03T06:00:00', name: 'x' });
    expect(seen[0]!.init.method).toBe('POST');
    expect(seen[0]!.url).toContain('upsertOnUid=true');
    expect(JSON.parse(String(seen[0]!.init.body)).name).toBe('x');
  });

  it('surfaces status + Retry-After on failure', async () => {
    const failFetch = (async () =>
      new Response('{"error":"rate"}', {
        status: 429,
        headers: { 'Retry-After': '7' },
      })) as unknown as typeof fetch;
    const client = createIntervalsClient({ apiKey: 'k', fetchImpl: failFetch });
    const err = await client.wellness('2026-10-01', '2026-10-24').catch((e) => e);
    expect(err).toBeInstanceOf(IntervalsApiError);
    expect((err as IntervalsApiError).status).toBe(429);
    expect((err as IntervalsApiError).retryAfterSeconds).toBe(7);
  });
});
