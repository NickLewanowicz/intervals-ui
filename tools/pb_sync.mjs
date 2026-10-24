/**
 * Manual sync runner — pulls every user's intervals.icu data into the PB
 * mirrors (plain JS twin of apps/worker/src/sync.ts; the Worker's version is
 * canonical for runtime, this one is the seed/"now" tool and must stay in
 * lockstep with it).
 *
 * Usage: node tools/pb_sync.mjs [email]
 */
import { readFileSync } from 'node:fs';

const env = (() => {
  const dot = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  return Object.fromEntries(
    dot
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
})();

const PB_URL = env.PB_URL;
const IV_BASE = 'https://intervals.icu/api/v1';
const IV_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) intervals-ui-sync/0.1';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// pockethost hibernates AND rate-limits /api paths (429) — retry with backoff,
// longer waits on 429 (honors Retry-After when present)
async function withRetry(fn, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === tries - 1) throw e;
      const is429 = String(e.message ?? e).includes('429');
      const retryAfter = is429 ? 20_000 : 1500 * (i + 1);
      await sleep(retryAfter);
    }
  }
}

async function superuserToken() {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.PB_EMAIL, password: env.PB_PASSWORD }),
  });
  if (!res.ok) throw new Error('superuser auth failed');
  return (await res.json()).token;
}
const token = await withRetry(superuserToken);

async function pb(method, path, body) {
  return withRetry(async () => {
    const res = await fetch(`${PB_URL}${path}`, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  });
}

async function iv(athleteId, path) {
  return withRetry(async () => {
    const auth = 'Basic ' + Buffer.from(`API_KEY:${env.INTERVALS_API_KEY}`).toString('base64');
    const res = await fetch(`${IV_BASE}/athlete/${athleteId}${path}`, {
      headers: { Authorization: auth, 'User-Agent': IV_UA },
    });
    if (!res.ok) throw new Error(`intervals ${res.status}: ${await res.text()}`);
    return res.json();
  });
}

async function upsertMirror(collection, userId, keyField, rows, keyValue) {
  if (!rows.length) return 0;
  const existing = await pb(
    'GET',
    `/api/collections/${collection}/records?filter=${encodeURIComponent(`user="${userId}"`)}&perPage=500`,
  );
  const byKey = new Map((existing.items ?? []).map((r) => [String(r[keyField] ?? ''), r]));
  let written = 0;
  for (const row of rows) {
    const prev = byKey.get(keyValue(row));
    if (prev && JSON.stringify(prev.data) === JSON.stringify(row.data)) continue; // unchanged
    if (prev) await pb('PATCH', `/api/collections/${collection}/records/${prev.id}`, row);
    else await pb('POST', `/api/collections/${collection}/records`, row);
    written++;
    await sleep(400); // stay under pockethost's /api rate limit
  }
  return written;
}

const filter = process.argv[2] ? `email="${process.argv[2]}"` : 'intervals_api_key != ""';
const list = await pb('GET', `/api/collections/users/records?filter=${encodeURIComponent(filter)}&perPage=50`);

for (const u of list.items ?? []) {
  if (!u.intervals_api_key) continue;
  const aid = u.intervals_athlete_id || '0';
  console.log(`syncing ${u.email} (${aid})…`);

  const [events, activities, wellness, settings] = await Promise.all([
    iv(aid, `/events?oldest=${day(-21)}&newest=${day(90)}`),
    iv(aid, `/activities?oldest=${day(-90)}&newest=${day(0)}&limit=200`),
    iv(aid, `/wellness?oldest=${day(-30)}&newest=${day(0)}`),
    iv(aid, '/sport-settings').catch(() => []),
  ]);

  const evCount = await upsertMirror('calendar_events', u.id, 'intervals_id', events.map((e) => ({
    user: u.id, intervals_id: e.id, uid: e.uid, start_date_local: e.start_date_local,
    end_date_local: e.end_date_local ?? null, category: e.category ?? 'WORKOUT', type: e.type ?? 'Run',
    sub_type: e.sub_type ?? null, name: e.name ?? '', description: e.description ?? '',
    distance: num(e.distance), moving_time: num(e.moving_time),
    icu_training_load: num(e.icu_training_load), icu_intensity: num(e.icu_intensity),
    paired_activity_id: e.paired_activity_id ?? null, workout_doc: e.workout_doc ?? null, data: e,
  })), (r) => String(r.intervals_id));

  const acCount = await upsertMirror('activities', u.id, 'intervals_id', activities.map((a) => ({
    user: u.id, intervals_id: a.id, start_date_local: a.start_date_local, name: a.name ?? '',
    type: a.type ?? 'Run', race: a.race ?? false, distance: num(a.distance),
    moving_time: num(a.moving_time), average_heartrate: num(a.average_heartrate), pace: num(a.pace),
    icu_training_load: num(a.icu_training_load), icu_intensity: num(a.icu_intensity),
    icu_ctl: num(a.icu_ctl), icu_atl: num(a.icu_atl), zone_times: a.icu_zone_times ?? null,
    hr_zone_times: a.icu_hr_zone_times ?? null, pace_zone_times: a.pace_zone_times ?? null,
    paired_event_id: a.paired_event_id ?? null, source: a.source ?? null, data: a,
  })), (r) => String(r.intervals_id));

  const wCount = await upsertMirror('wellness', u.id, 'date', wellness.map((w) => ({
    user: u.id, date: w.id, ctl: num(w.ctl), atl: num(w.atl), resting_hr: num(w.restingHR),
    hrv: num(w.hrv), sleep_secs: num(w.sleepSecs), data: w,
  })), (r) => String(r.date));

  let zone = false;
  if (Array.isArray(settings) && settings.length) {
    const existing = await pb('GET', `/api/collections/sport_settings/records?filter=${encodeURIComponent(`user="${u.id}"`)}`);
    const body = { user: u.id, data: settings };
    if (existing.items?.[0]) await pb('PATCH', `/api/collections/sport_settings/records/${existing.items[0].id}`, body);
    else await pb('POST', '/api/collections/sport_settings/records', body);
    zone = true;
  }

  const nowUtc = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  const ssExisting = await pb('GET', `/api/collections/sync_state/records?filter=${encodeURIComponent(`user="${u.id}"`)}`);
  if (ssExisting.items?.[0]) await pb('PATCH', `/api/collections/sync_state/records/${ssExisting.items[0].id}`, { status: 'ok', error: null, last_sync: nowUtc });
  else await pb('POST', '/api/collections/sync_state/records', { user: u.id, status: 'ok', error: null, last_sync: nowUtc });

  console.log(`  ✓ events=${evCount} activities=${acCount} wellness=${wCount} zones=${zone}`);
}
console.log('done');
