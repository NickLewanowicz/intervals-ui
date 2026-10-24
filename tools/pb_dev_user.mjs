/**
 * Create/refresh the developer user on the intervals PocketBase instance,
 * standing in for Google OAuth until the consent screen exists (docs/AUTH.md
 * Part A). Idempotent by email. Writes the generated password to
 * .scratch/dev-user.txt (gitignored) — never to the repo.
 *
 * Usage: node tools/pb_dev_user.mjs [email]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const env = (() => {
  const dot = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  return Object.fromEntries(
    dot
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
})();

const PB_URL = env.PB_URL || 'https://intervals.pockethost.io';
const EMAIL = process.argv[2] || 'nick@imnick.dev';

const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: env.PB_EMAIL, password: env.PB_PASSWORD }),
});
if (!res.ok) throw new Error('superuser auth failed');
const token = (await res.json()).token;

async function pb(method, path, body) {
  const r = await fetch(`${PB_URL}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const fields = {
  email: EMAIL,
  name: 'Nick',
  emailVisibility: true,
  verified: true,
  intervals_athlete_id: env.INTERVALS_ATHLETE_ID || 'i167187',
  intervals_api_key: env.INTERVALS_API_KEY || '',
  openrouter_api_key: env.OPENROUTER_API_KEY || '',
  units: 'km',
};

const list = await pb(
  'GET',
  `/api/collections/users/records?filter=${encodeURIComponent(`email="${EMAIL}"`)}`,
);
const existing = list.items?.[0];

let password;
if (existing) {
  password = randomBytes(9).toString('base64url');
  await pb('PATCH', `/api/collections/users/records/${existing.id}`, {
    ...fields,
    password,
    passwordConfirm: password,
  });
  console.log(`✓ refreshed dev user ${EMAIL} (${existing.id})`);
} else {
  password = randomBytes(9).toString('base64url');
  const created = await pb('POST', '/api/collections/users/records', {
    ...fields,
    password,
    passwordConfirm: password,
  });
  console.log(`✓ created dev user ${EMAIL} (${created.id})`);
}

mkdirSync(new URL('../.scratch/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../.scratch/dev-user.txt', import.meta.url),
  `${EMAIL} / ${password}\n(sign in with email+password until Google OAuth is configured)\n`,
);
console.log('credentials → .scratch/dev-user.txt (gitignored)');

// smoke: auth-with-password works
const login = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: EMAIL, password }),
});
console.log('auth-with-password smoke:', login.ok ? 'OK' : `FAILED ${login.status}`);
