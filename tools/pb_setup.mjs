/**
 * Provision the intervals PocketBase instance (https://intervals.pockethost.io).
 * Idempotent: creates/updates collections to match the schema defined below.
 * This script IS the schema of record for the instance (see docs/ARCHITECTURE.md
 * — schema changes land here + in a pb_migrations/ note, then re-run).
 *
 * Field JSON targets PocketBase ≥0.27 "flattened" field format.
 * Secret text fields are `hidden: true` (never returned to clients; the
 * worker reads them as superuser).
 *
 * Auth: superuser via PB_EMAIL/PB_PASSWORD (or PB_TOKEN) from .env.
 * Usage: node tools/pb_setup.mjs
 */
import { readFileSync } from 'node:fs';

const env = (() => {
  // file .env first, then real process.env overrides (QA stack targets local PB)
  const dot = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const file = Object.fromEntries(
    dot
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  return { ...file, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('PB_'))) };
})();

const PB_URL = process.env.PB_URL || env.PB_URL || 'https://intervals.pockethost.io';

let token = process.env.PB_TOKEN || env.PB_TOKEN || null;
if (!token) {
  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_EMAIL || env.PB_EMAIL, password: process.env.PB_PASSWORD || env.PB_PASSWORD }),
  });
  if (!res.ok) throw new Error(`superuser auth failed: ${res.status} ${await res.text()}`);
  token = (await res.json()).token;
}

async function pb(method, path, body) {
  const res = await fetch(`${PB_URL}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

// ---------- field builders (PocketBase ≥0.27 flattened format) ----------

const text = (name, max = 2000, { hidden = false, required = false } = {}) => ({
  name,
  type: 'text',
  max,
  min: 0,
  pattern: '',
  required,
  presentable: false,
  hidden,
});
const num = (name) => ({ name, type: 'number', min: null, max: null, onlyInt: false, required: false });
const bool = (name) => ({ name, type: 'bool', required: false });
const json = (name) => ({ name, type: 'json', maxSize: 2_000_000, required: false });
const select = (name, values) => ({ name, type: 'select', values, maxSelect: 1, required: false });
const rel = (name, collectionId, { required = true, cascade = true } = {}) => ({
  name,
  type: 'relation',
  collectionId,
  cascadeDelete: cascade,
  minSelect: null,
  maxSelect: 1,
  required,
});

const OWNER_READ = { listRule: 'user = @request.auth.id', viewRule: 'user = @request.auth.id' };
const LOCKED = { createRule: null, updateRule: null, deleteRule: null }; // superuser (worker) only
// ADR-0006 hybrid chat transport: the CLIENT creates its own chat turns and
// tool-call proposals (owner-scoped: the row's user must be the caller).
// Update/delete stay locked — apply/dismiss and status transitions remain
// Worker-only (the intervals.icu key lives server-side).
const OWNER_CREATE = {
  createRule: 'user = @request.auth.id && @request.body.user = @request.auth.id',
  updateRule: null,
  deleteRule: null,
};

// this PB version requires explicit autodate fields on base collections
const AUTODATES = [
  { name: 'created', type: 'autodate', onCreate: true },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

async function getCollection(name) {
  return pb('GET', `/api/collections/${name}`).catch(() => null);
}

async function upsertCollection(def) {
  const def2 = { ...def, fields: [...def.fields, ...AUTODATES] };
  const existing = await getCollection(def2.name);
  if (existing) {
    await pb('PATCH', `/api/collections/${def2.name}`, {
      fields: def2.fields,
      listRule: def2.listRule ?? null,
      viewRule: def2.viewRule ?? null,
      createRule: def2.createRule ?? null,
      updateRule: def2.updateRule ?? null,
      deleteRule: def2.deleteRule ?? null,
      indexes: def2.indexes ?? existing.indexes,
    });
    console.log(`✓ updated collection ${def2.name}`);
  } else {
    await pb('POST', '/api/collections', def2);
    console.log(`✓ created collection ${def2.name}`);
  }
  return getCollection(def2.name);
}

// ---------- schema ----------

const users = await getCollection('users');
if (!users) throw new Error('users auth collection missing');
const USERS_ID = users.id;

// 1) extend users with app fields (append-only; hidden for secrets)
const usersAdditions = [
  text('intervals_athlete_id', 40),
  text('intervals_api_key', 200, { hidden: true }),
  text('openrouter_api_key', 200, { hidden: true }),
  text('preferred_model', 120),
  select('units', ['km', 'mi']),
  select('theme', ['system', 'light', 'dark']),
  text('athlete_profile', 4000),
];
const existingFieldNames = new Set(users.fields.map((f) => f.name));
const usersFields = [...users.fields, ...usersAdditions.filter((f) => !existingFieldNames.has(f.name))];
await pb('PATCH', '/api/collections/users', { fields: usersFields });
console.log('✓ users extended with app fields (secret fields hidden; password auth stays ON until Google OAuth lands)');

// 2) mirrors + workflow collections
const mirrorFields = (extra) => [rel('user', USERS_ID), ...extra, json('data')];

await upsertCollection({
  name: 'sync_state',
  type: 'base',
  fields: [rel('user', USERS_ID), text('status', 40), text('error', 500), text('last_sync', 40)],
  indexes: ['CREATE UNIQUE INDEX idx_sync_state_user ON sync_state (user)'],
  ...OWNER_READ,
  ...LOCKED,
});

const chatSessions = await upsertCollection({
  name: 'chat_sessions',
  type: 'base',
  fields: [
    rel('user', USERS_ID),
    text('title', 120),
    text('model', 120),
    // round-10 multi-session: pinned chats group on top of the sessions list
    bool('pinned'),
    // dedicated last-activity stamp (ISO text, sorts lexicographically) — a
    // rename/pin must NOT reorder the list, so PB's auto `updated` is not the
    // sort key (see docs/research/chat-ui-patterns.md §1)
    text('last_message_at', 40),
  ],
  indexes: ['CREATE INDEX idx_chatsess_user_activity ON chat_sessions (user, last_message_at)'],
  listRule: 'user = @request.auth.id',
  viewRule: 'user = @request.auth.id',
  createRule: 'user = @request.auth.id',
  updateRule: 'user = @request.auth.id',
  deleteRule: 'user = @request.auth.id',
});
console.log('✓ chat_sessions ready (pinned + last_message_at, owner may update)');

await upsertCollection({
  name: 'calendar_events',
  type: 'base',
  fields: mirrorFields([
    num('intervals_id'),
    text('uid', 60),
    text('start_date_local', 40),
    text('end_date_local', 40),
    text('category', 20),
    text('type', 20),
    text('sub_type', 30),
    text('name', 300),
    text('description', 8000),
    num('distance'),
    num('moving_time'),
    num('icu_training_load'),
    num('icu_intensity'),
    num('paired_activity_id'),
    json('workout_doc'),
  ]),
  indexes: ['CREATE UNIQUE INDEX idx_cal_user_ivid ON calendar_events (user, intervals_id)'],
  ...OWNER_READ,
  ...LOCKED,
});

await upsertCollection({
  name: 'activities',
  type: 'base',
  fields: mirrorFields([
    text('intervals_id', 40),
    text('start_date_local', 40),
    text('name', 300),
    text('type', 20),
    bool('race'),
    num('distance'),
    num('moving_time'),
    num('average_heartrate'),
    num('pace'),
    num('icu_training_load'),
    num('icu_intensity'),
    num('icu_ctl'),
    num('icu_atl'),
    json('zone_times'),
    json('hr_zone_times'),
    json('pace_zone_times'),
    num('paired_event_id'),
    text('source', 40),
  ]),
  indexes: ['CREATE UNIQUE INDEX idx_act_user_ivid ON activities (user, intervals_id)'],
  ...OWNER_READ,
  ...LOCKED,
});

await upsertCollection({
  name: 'wellness',
  type: 'base',
  fields: mirrorFields([
    text('date', 12),
    num('ctl'),
    num('atl'),
    num('resting_hr'),
    num('hrv'),
    num('sleep_secs'),
  ]),
  indexes: ['CREATE UNIQUE INDEX idx_well_user_date ON wellness (user, date)'],
  ...OWNER_READ,
  ...LOCKED,
});

await upsertCollection({
  name: 'sport_settings',
  type: 'base',
  fields: [rel('user', USERS_ID), json('data')],
  indexes: ['CREATE UNIQUE INDEX idx_sport_user ON sport_settings (user)'],
  ...OWNER_READ,
  ...LOCKED,
});

await upsertCollection({
  name: 'chat_messages',
  type: 'base',
  fields: [
    rel('user', USERS_ID),
    rel('session', chatSessions.id, { required: true }),
    text('role', 20),
    text('content', 40000),
    json('tool_calls'),
    json('usage'),
  ],
  indexes: ['CREATE INDEX idx_chatmsg_session ON chat_messages (session, created)'],
  ...OWNER_READ,
  ...OWNER_CREATE,
});

await upsertCollection({
  name: 'proposals',
  type: 'base',
  fields: [
    rel('user', USERS_ID),
    rel('session', chatSessions.id, { required: false }),
    text('kind', 30),
    json('payload'),
    text('rationale', 1000),
    select('status', ['pending', 'applied', 'dismissed', 'failed']),
    num('intervals_event_id'),
    text('error', 1000),
    text('applied_at', 40),
    text('bundle_key', 140),
    text('bundle_summary', 200),
  ],
  indexes: ['CREATE INDEX idx_prop_user_status ON proposals (user, status, created)', 'CREATE INDEX idx_prop_user_bundle ON proposals (user, bundle_key)'],
  ...OWNER_READ,
  ...OWNER_CREATE,
});

// cleanup any probe collections from schema exploration
for (const junk of ['zz_test_select', 'zz_t2']) {
  if (await getCollection(junk)) {
    await pb('DELETE', `/api/collections/${junk}`);
    console.log(`✓ removed probe collection ${junk}`);
  }
}

console.log('\nPocketBase schema provisioned on', PB_URL);
