/**
 * Sync a user's intervals.icu data into the PocketBase mirrors
 * (calendar_events / activities / wellness / sport_settings).
 *
 * Direction is one-way: intervals.icu is canonical, PB is a rebuildable
 * serving mirror (ADR-0001). Runs from the cron trigger and after proposal
 * applies. Uses the PB batch API to stay inside Worker subrequest limits.
 */
import { createIntervalsClient } from '@intervals/core';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import { byUser, listRecords, updateRecord, createRecord, getFirst, type Env } from './pb';

const DAY = 24 * 60 * 60 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Key-order-stable JSON (PocketBase round-trips JSONB with arbitrary key
 * order — naive stringify would see every row as "changed" and blow the
 * Workers subrequest budget rewriting identical mirrors).
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',') + '}';
}

export interface SyncOptions {
  /** Days back for recorded activities (default 90). */
  activityDays?: number;
  /** Days back for calendar events (default 21 — past weeks still matter for the coach). */
  eventDaysBack?: number;
  /** Days forward for calendar events (default 90 — plans + races). */
  eventDaysForward?: number;
  /** Days back for wellness (default 30). */
  wellnessDays?: number;
}

export interface SyncResult {
  events: number;
  activities: number;
  wellness: number;
  sportSettings: boolean;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function eventRow(userId: string, e: EventEx): Record<string, unknown> {
  return {
    user: userId,
    intervals_id: e.id,
    uid: e.uid,
    start_date_local: e.start_date_local,
    end_date_local: e.end_date_local ?? null,
    category: e.category ?? 'WORKOUT',
    type: e.type ?? 'Run',
    sub_type: e.sub_type ?? null,
    name: e.name ?? '',
    description: e.description ?? '',
    distance: num(e.distance),
    moving_time: num(e.moving_time),
    icu_training_load: num(e.icu_training_load),
    icu_intensity: num(e.icu_intensity),
    paired_activity_id: e.paired_activity_id ?? null,
    workout_doc: e.workout_doc ?? null,
    data: e,
  };
}

export function activityRow(userId: string, a: Activity): Record<string, unknown> {
  return {
    user: userId,
    intervals_id: a.id,
    start_date_local: a.start_date_local,
    name: a.name ?? '',
    type: a.type ?? 'Run',
    race: a.race ?? false,
    distance: num(a.distance),
    moving_time: num(a.moving_time),
    average_heartrate: num(a.average_heartrate),
    pace: num(a.pace),
    icu_training_load: num(a.icu_training_load),
    icu_intensity: num(a.icu_intensity),
    icu_ctl: num(a.icu_ctl),
    icu_atl: num(a.icu_atl),
    zone_times: a.icu_zone_times ?? null,
    hr_zone_times: a.icu_hr_zone_times ?? null,
    pace_zone_times: a.pace_zone_times ?? null,
    paired_event_id: a.paired_event_id ?? null,
    source: a.source ?? null,
    data: a,
  };
}

export function wellnessRow(userId: string, w: WellnessDay): Record<string, unknown> {
  return {
    user: userId,
    date: w.id,
    ctl: num(w.ctl),
    atl: num(w.atl),
    resting_hr: num(w.restingHR),
    hrv: num(w.hrv),
    sleep_secs: num(w.sleepSecs),
    data: w,
  };
}

/**
 * Upsert mirror rows by natural key. pockethost DISABLES the PB batch API,
 * so upserts are sequential — rows whose upstream object is byte-identical to
 * the stored mirror are skipped, keeping steady-state subrequest counts tiny
 * (a daily sync typically writes only the day's new/changed rows).
 */
async function upsertMirror(
  env: Env,
  collection: string,
  userId: string,
  /** PB field holding the natural key (intervals_id / date). */
  keyField: string,
  rows: Array<Record<string, unknown>>,
  keyValue: (row: Record<string, unknown>) => string,
): Promise<number> {
  if (!rows.length) return 0;
  const existing = await listRecords(env, collection, byUser(userId), '&perPage=500');
  const byKey = new Map(existing.map((r) => [String(r[keyField] ?? ''), r]));
  let written = 0;
  for (const row of rows) {
    const prev = byKey.get(keyValue(row));
    const unchanged =
      prev && stableStringify(prev.data) === stableStringify(row.data);
    if (unchanged) continue;
    if (prev) await updateRecord(env, collection, prev.id, row);
    else await createRecord(env, collection, row);
    written++;
  }
  return written;
}

export async function syncUser(
  env: Env,
  userId: string,
  intervalsApiKey: string,
  athleteId: string | undefined,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const client = createIntervalsClient({
    apiKey: intervalsApiKey,
    athleteId: athleteId || '0',
  });
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

  const [events, activities, wellness, settings] = await Promise.all([
    client.events(daysAgo(opts.eventDaysBack ?? 21), new Date(now.getTime() + (opts.eventDaysForward ?? 90) * DAY)),
    client.activities(daysAgo(opts.activityDays ?? 90), now, 200),
    client.wellness(daysAgo(opts.wellnessDays ?? 30), now),
    client.sportSettings().catch(() => []),
  ]);

  const evCount = await upsertMirror(env, 'calendar_events', userId, 'intervals_id', events.map((e) => eventRow(userId, e)), (r) => String(r.intervals_id));
  const acCount = await upsertMirror(env, 'activities', userId, 'intervals_id', activities.map((a) => activityRow(userId, a)), (r) => String(r.intervals_id));
  const wCount = await upsertMirror(env, 'wellness', userId, 'date', wellness.map((w) => wellnessRow(userId, w)), (r) => String(r.date));

  let settingsOk = false;
  if (Array.isArray(settings) && settings.length) {
    const row = { user: userId, data: settings };
    const existing = await getFirst(env, 'sport_settings', byUser(userId));
    if (existing) await updateRecord(env, 'sport_settings', existing.id, row);
    else await createRecord(env, 'sport_settings', row);
    settingsOk = true;
  }

  await upsertSyncState(env, userId, 'ok', null);
  return { events: evCount, activities: acCount, wellness: wCount, sportSettings: settingsOk };
}

export async function upsertSyncState(
  env: Env,
  userId: string,
  status: string,
  error: string | null,
): Promise<void> {
  const row = {
    user: userId,
    status,
    error,
    last_sync: new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z',
  };
  const existing = await getFirst(env, 'sync_state', byUser(userId));
  if (existing) await updateRecord(env, 'sync_state', existing.id, row);
  else await createRecord(env, 'sync_state', row);
}

/**
 * The sync loop: every user with intervals creds, capped per run to stay
 * inside Pages Functions subrequest limits (the rest catch the next cycle).
 */
export async function cronSync(env: Env): Promise<void> {
  const users = await listRecords(env, 'users', `intervals_api_key != ""`, '&perPage=5');
  for (const u of users) {
    try {
      await syncUser(
        env,
        u.id,
        String(u.intervals_api_key ?? ''),
        String(u.intervals_athlete_id ?? '') || undefined,
      );
    } catch (e) {
      await upsertSyncState(env, u.id, 'error', String(e).slice(0, 500)).catch(() => {});
    }
  }
}
