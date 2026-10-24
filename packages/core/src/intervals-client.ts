/**
 * Thin typed client for the ~7 intervals.icu endpoints this app needs.
 *
 * Why hand-rolled (ADR-0003, docs/research/intervals-api-brief.md §9):
 * the surface is tiny, auth is one header, and the unofficial SDK is a
 * 2-week-old 0.x with shallow generated types. Full control, zero deps.
 *
 * Auth: Basic with username literally "API_KEY" and the key as password.
 * Runs anywhere with fetch (browser, Node ≥18, Cloudflare Workers).
 * Always sends a browser-like User-Agent — Cloudflare in front of
 * intervals.icu can block library default UAs.
 */
import type {
  Activity,
  Athlete,
  EventEx,
  SportSettings,
  WellnessDay,
} from './types';

const BASE = 'https://intervals.icu/api/v1';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 intervals-ui/0.1';

export class IntervalsApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(`intervals.icu API ${status}: ${body.slice(0, 200)}`);
    this.name = 'IntervalsApiError';
  }
}

export interface IntervalsClientOptions {
  apiKey: string;
  /** Athlete id; "0" (self) works for any key owner. */
  athleteId?: string;
  fetchImpl?: typeof fetch;
}

export function createIntervalsClient(opts: IntervalsClientOptions) {
  const athleteId = opts.athleteId || '0';
  const f = opts.fetchImpl ?? fetch;
  const auth = 'Basic ' + btoa(`API_KEY:${opts.apiKey}`);

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await f(BASE + path, {
      ...init,
      headers: {
        Authorization: auth,
        'User-Agent': UA,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const retryAfter = res.headers.get('Retry-After') ?? undefined;
      throw new IntervalsApiError(
        res.status,
        await res.text().catch(() => ''),
        retryAfter ? Number(retryAfter) : undefined,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const qs = (params: Record<string, string | number | boolean | undefined>) => {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    if (!entries.length) return '';
    return (
      '?' +
      entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
    );
  };

  const yyyyMmDd = (d: Date) => d.toISOString().slice(0, 10);

  return {
    athlete: () => request<Athlete>(`/athlete/${athleteId}`),

    /** Calendar entries (planned workouts, races, notes) for a date range. */
    events: (oldest: Date | string, newest: Date | string) =>
      request<EventEx[]>(
        `/athlete/${athleteId}/events` +
          qs({
            oldest: typeof oldest === 'string' ? oldest : yyyyMmDd(oldest),
            newest: typeof newest === 'string' ? newest : yyyyMmDd(newest),
          }),
      ),

    /**
     * Create a planned calendar entry. With upsertOnUid=true + a stable uid,
     * re-planning is idempotent (create-or-update) — always used by the coach.
     */
    createEvent: (event: EventEx, upsertOnUid = true) =>
      request<EventEx>(
        `/athlete/${athleteId}/events${qs({ upsertOnUid })}`,
        { method: 'POST', body: JSON.stringify(event) },
      ),

    createEvents: (events: EventEx[], upsertOnUid = true) =>
      request<EventEx[]>(
        `/athlete/${athleteId}/events/bulk${qs({ upsertOnUid })}`,
        { method: 'POST', body: JSON.stringify(events) },
      ),

    updateEvent: (eventId: number, event: Partial<EventEx>) =>
      request<EventEx>(`/athlete/${athleteId}/events/${eventId}`, {
        method: 'PUT',
        body: JSON.stringify(event),
      }),

    deleteEvent: (eventId: number) =>
      request<void>(`/athlete/${athleteId}/events/${eventId}`, {
        method: 'DELETE',
      }),

    /** Recorded activities in a date range (desc). Future windows return []. */
    activities: (
      oldest: Date | string,
      newest: Date | string,
      limit = 100,
    ) =>
      request<Activity[]>(
        `/athlete/${athleteId}/activities` +
          qs({
            oldest: typeof oldest === 'string' ? oldest : yyyyMmDd(oldest),
            newest: typeof newest === 'string' ? newest : yyyyMmDd(newest),
            limit,
          }),
      ),

    wellness: (oldest: Date | string, newest: Date | string) =>
      request<WellnessDay[]>(
        `/athlete/${athleteId}/wellness` +
          qs({
            oldest: typeof oldest === 'string' ? oldest : yyyyMmDd(oldest),
            newest: typeof newest === 'string' ? newest : yyyyMmDd(newest),
          }),
      ),

    sportSettings: () => request<SportSettings[]>(`/athlete/${athleteId}/sport-settings`),
  };
}

export type IntervalsClient = ReturnType<typeof createIntervalsClient>;
