/**
 * Seed the local QA PocketBase with persona accounts + DIFFERENT data shapes.
 * Run by tools/qa_stack.sh (schema must already be provisioned by pb_setup).
 *
 * Personas (one account each, distinct data so QA sessions differ):
 *  marathon-build  — 45km/wk, marathon build in progress, quality + long run, HRV data
 *  comeback        — returning from injury, low volume, all-easy, no races
 *  racer           — 10K in 3 weeks (RACE_A), tune-up RACE_B, taper-ish week
 *  lowdata         — minimal data: 3 events, no wellness, no activities
 *  emptystate      — no data at all (tests empty states)
 *
 * Usage: PB_URL=... PB_EMAIL=... PB_PASSWORD=... node tools/qa_seed_personas.mjs
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  (process.env.PB_EMAIL ? [['PB_EMAIL', process.env.PB_EMAIL], ['PB_PASSWORD', process.env.PB_PASSWORD], ['PB_URL', process.env.PB_URL]] : [])
    .concat([['PB_URL', process.env.PB_URL || 'http://127.0.0.1:8090']]),
);
const PB = env.PB_URL || 'http://127.0.0.1:8090';
const SUPER = { identity: process.env.PB_EMAIL, password: process.env.PB_PASSWORD };

const t = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(SUPER),
});
if (!t.ok) throw new Error('superuser auth failed: ' + (await t.text()));
const T = (await t.json()).token;

async function pb(method, path, body) {
  const r = await fetch(`${PB}${path}`, {
    method, headers: { Authorization: T, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok && r.status !== 404) { if (body) console.error('FAILING BODY:', JSON.stringify(body).slice(0, 400)); throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`); }
  return text ? JSON.parse(text) : null;
}

const day = (offset, hhmm) => {
  const d = new Date(Date.now() + offset * 86400_000);
  const date = d.toISOString().slice(0, 10);
  return `${date}T${hhmm || '07:00'}:00`;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function personaData(kind) {
  // returns { events: [...], activities: [...], wellness: [...] }
  let seq = 0;
  const mk = (off, hh, name, cat, dist, dur, load, extra = {}) => ({
    id: `e${++seq}`,
    uid: `qa-${kind}-${off}-${hh}`,
    start_date_local: day(off, hh),
    end_date_local: day(off, hh),
    category: cat, type: 'Run', name,
    distance: dist, moving_time: dur,
    icu_training_load: load, icu_intensity: null,
    paired_activity_id: null, workout_doc: null,
    athlete_id: 'qa', created_by_id: 'qa', ...extra,
  });
  let aseq = 0;
  const act = (off, hh, name, dist, dur, pace, hr, load, zone, race = false) => ({
    id: `a${++aseq}`,
    start_date_local: day(off, hh), name, type: 'Run', race,
    distance: dist, moving_time: dur, average_heartrate: hr,
    pace, icu_training_load: load,
    icu_zone_times: zone, icu_hr_zones: [143, 162, 171, 183, 190, 203],
    threshold_pace: 3.7, lthr: 180, paired_event_id: null, source: 'QA',
  });
  const well = (off, ctl, atl, hrv, rhr, sleep) => ({
    id: day(off), ctl, atl, restingHR: rhr, hrv, sleepSecs: sleep * 3600,
  });

  if (kind === 'marathon-build')
    return {
      profile: 'Marathon build, 45km/week. Goal: sub-3:10 in 9 weeks. Prefers over-preparing.',
      events: [
        mk(-14, '17:45', 'Run club — 10×(1\' Z3 / 1\' easy)', 'WORKOUT', 8500, 2827, 52),
        mk(-7, '08:00', 'Long run 24k', 'WORKOUT', 24000, 6900, 118),
        mk(-6, '06:00', 'Easy aerobic', 'WORKOUT', 8000, 2700, 30),
        mk(0, '06:00', 'Easy aerobic + strides', 'WORKOUT', 8000, 2700, 30),
        mk(1, '17:45', 'Run club — 8×(2\' Z4 / 2\' easy)', 'WORKOUT', 9000, 2820, 62),
        mk(3, '06:00', 'Steady 10k w/ 4k Z3', 'WORKOUT', 10000, 2460, 55),
        mk(6, '08:00', 'Long run 26k', 'WORKOUT', 26000, 7500, 128),
        mk(13, '08:00', 'Long run 28k w/ 8k MP', 'WORKOUT', 28000, 7800, 145),
        mk(60, '09:00', 'Goal Marathon', 'RACE_A', 42195, 11100, 320),
      ],
      activities: [
        act(-14, '17:47', 'Run club — 10×(1\' hard / 1\' easy)', 8823, 2935, 3.32, 156, 92,
          [{ id: 'Z1', secs: 706 }, { id: 'Z4', secs: 555 }]),
        act(-7, '08:05', 'Long run 24k', 24100, 6950, 4.81, 148, 118,
          [{ id: 'Z1', secs: 3600 }, { id: 'Z2', secs: 3300 }]),
        act(-6, '06:10', 'Easy aerobic', 7900, 2720, 5.75, 138, 30,
          [{ id: 'Z1', secs: 2400 }, { id: 'Z2', secs: 320 }]),
      ],
      wellness: [
        well(-3, 41.2, 38.7, 58, 50, 7.2),
        well(-2, 41.5, 40.1, 55, 51, 6.8),
        well(-1, 41.8, 42.0, 52, 52, 6.4),
        well(0, 42.0, 43.4, 51, 52, 7.0),
      ],
    };

  if (kind === 'comeback')
    return {
      profile: 'Returning from a soleus injury. Physio: all easy, ≤4/10 discomfort, no quality for 3 more weeks.',
      events: [
        mk(-3, '06:00', 'Walk/run 20min', 'WORKOUT', 2400, 1200, 8),
        mk(-1, '06:00', 'Easy 20min', 'WORKOUT', 3000, 1260, 10),
        mk(0, '06:00', 'Easy 25min', 'WORKOUT', 3500, 1500, 12),
        mk(2, '06:00', 'Easy 30min', 'WORKOUT', 4000, 1740, 14),
        mk(4, '06:00', 'Easy 30min + 4×strides', 'WORKOUT', 4500, 1800, 18),
      ],
      activities: [
        act(-3, '06:05', 'Walk/run 20min', 2350, 1230, 8.72, 122, 8,
          [{ id: 'Z1', secs: 1200 }]),
        act(-1, '06:05', 'Easy 20min', 3050, 1280, 7.0, 128, 10,
          [{ id: 'Z1', secs: 1260 }]),
      ],
      wellness: [
        well(-2, 18.2, 16.1, 48, 54, 7.5),
        well(-1, 18.4, 17.0, 50, 53, 7.8),
        well(0, 18.5, 17.2, 52, 52, 8.1),
      ],
    };

  if (kind === 'racer')
    return {
      profile: '10K goal race (sub-42) in 3 weeks — A priority. Recent HM PB 1:37.',
      events: [
        mk(-7, '09:00', 'Parkrun tune-up', 'RACE_B', 5000, 1290, 45),
        mk(0, '06:00', 'Easy 6km', 'WORKOUT', 6000, 1920, 25),
        mk(1, '18:00', '6×800m Z5', 'WORKOUT', 8000, 2520, 68),
        mk(3, '06:00', 'Threshold 4km', 'WORKOUT', 9000, 2520, 58),
        mk(6, '08:00', 'Long run 16k', 'WORKOUT', 16000, 4920, 78),
        mk(21, '09:00', 'Goal 10K — sub-42', 'RACE_A', 10000, 2520, 95),
      ],
      activities: [
        act(-7, '09:05', 'Parkrun tune-up', 5000, 1265, 4.21, 172, 45,
          [{ id: 'Z4', secs: 900 }, { id: 'Z5', secs: 365 }], true),
      ],
      wellness: [
        well(-2, 48.9, 46.2, 62, 48, 7.4),
        well(-1, 49.1, 47.5, 61, 48, 7.1),
        well(0, 49.3, 48.0, 63, 47, 7.6),
      ],
    };

  if (kind === 'lowdata')
    return {
      profile: '',
      events: [
        mk(1, '06:00', 'Easy 5km', 'WORKOUT', 5000, 1800, 20),
      ],
      activities: [],
      wellness: [],
    };

  return { profile: '', events: [], activities: [], wellness: [] };
}

// QA box: wipe ALL mirror + workflow rows first (ids collide across reseeds
// because intervals_id values are synthetic). Users are handled per-persona.
for (const col of ['proposals', 'chat_messages', 'chat_sessions', 'calendar_events', 'activities', 'wellness', 'sync_state']) {
  const rows = await pb('GET', `/api/collections/${col}/records?perPage=500`);
  for (const r of rows.items ?? []) await pb('DELETE', `/api/collections/${col}/records/${r.id}`).catch(() => {});
}

const PERSONAS = [
  { email: 'qa-marathon@intervals.test', kind: 'marathon-build', name: 'QA Marathon' },
  { email: 'qa-comeback@intervals.test', kind: 'comeback', name: 'QA Comeback' },
  { email: 'qa-racer@intervals.test', kind: 'racer', name: 'QA Racer' },
  { email: 'qa-lowdata@intervals.test', kind: 'lowdata', name: 'QA Lowdata' },
  { email: 'qa-empty@intervals.test', kind: 'emptystate', name: 'QA Empty' },
];
const PASS = process.env.QA_PERSONA_PASSWORD || `Qa${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}!`;

async function createUser(email, pass, name, kind) {
  const r = await pb('POST', '/api/collections/users/records', {
    email, password: pass, passwordConfirm: pass, name,
    emailVisibility: true, verified: true,
    intervals_athlete_id: `qa-${kind}`,
    units: 'km', theme: 'system',
    athlete_profile: personaData(kind).profile,
  });
  return r;
}

for (const p of PERSONAS) {
  const existing = await pb('GET', `/api/collections/users/records?filter=${encodeURIComponent(`email="${p.email}"`)}`);
  let user = existing?.items?.[0];
  if (user) {
    await pb('PATCH', `/api/collections/users/records/${user.id}`, { password: PASS, passwordConfirm: PASS, name: p.name });
  } else {
    user = await createUser(p.email, PASS, p.name, p.kind);
  }
  const data = personaData(p.kind);
  await pb('DELETE', `/api/collections/users/records/${user.id}`, undefined).catch(() => {});
  user = await createUser(p.email, PASS, p.name, p.kind);

  // wipe old mirror rows for this user (idempotent reseeding)
  for (const col of ['calendar_events', 'activities', 'wellness']) {
    const old = await pb('GET', `/api/collections/${col}/records?filter=${encodeURIComponent(`user="${user.id}"`)}&perPage=500`);
    for (const row of old.items ?? []) await pb('DELETE', `/api/collections/${col}/records/${row.id}`).catch(() => {});
  }

  // seed mirrors (strip synthetic `id` — PB generates record ids).
  // calendar_events.intervals_id is a NUMBER field (production parity:
  // real ids are integers) — activities.intervals_id is TEXT ('i…').
  let eseq = 100;
  for (const { id: _sid, ...e } of data.events) {
    await pb('POST', '/api/collections/calendar_events/records', { user: user.id, intervals_id: eseq++, ...e, data: e });
  }
  for (const { id: _sid, ...a } of data.activities) {
    await pb('POST', '/api/collections/activities/records', { user: user.id, intervals_id: `qa${_sid}`, ...a, data: a });
  }
  for (const w of data.wellness) await pb('POST', '/api/collections/wellness/records', { user: user.id, date: String(w.id).slice(0, 12), ctl: w.ctl, atl: w.atl, resting_hr: w.restingHR, hrv: w.hrv, sleep_secs: w.sleepSecs, data: w });
  await pb('POST', '/api/collections/sync_state/records', { user: user.id, status: 'ok', last_sync: new Date().toISOString() });
  console.log(`✓ ${p.email} (${p.kind}): ${data.events.length} events, ${data.activities.length} activities, ${data.wellness.length} wellness`);
}
console.log(`\npersona logins (password: ${PASS}):`);
for (const p of PERSONAS) console.log(`  ${p.email} — ${p.kind}`);
console.log(`\nstack: PB http://127.0.0.1:8090 · mock LLM http://127.0.0.1:8099/v1`);
