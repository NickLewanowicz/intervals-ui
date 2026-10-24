/**
 * PocketBase REST access for the Worker — no SDK, just fetch. Two identities:
 *
 * - Superuser (env PB_EMAIL/PB_PASSWORD): mirrors, proposals, chat rows,
 *   user lookups. Token cached per-isolate; PB tokens live ~1 day.
 * - The calling user (their Bearer token from the app): validated once per
 *   request via auth-refresh, which also returns their users record.
 */
export interface Env {
  PB_URL: string;
  PB_EMAIL: string;
  PB_PASSWORD: string;
  /** Shared secret for the Gitea-cron sync trigger (GET /api/cron). */
  CRON_SECRET: string;
}

export class PbError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`PocketBase ${status}: ${body.slice(0, 200)}`);
    this.name = 'PbError';
  }
}

let superuserToken: { token: string; expMs: number } | null = null;

function jwtExpMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now();
  } catch {
    return Date.now();
  }
}

async function superuserAuth(env: Env, force = false): Promise<string> {
  if (!force && superuserToken && superuserToken.expMs - Date.now() > 5 * 60_000) {
    return superuserToken.token;
  }
  const res = await fetch(`${env.PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.PB_EMAIL, password: env.PB_PASSWORD }),
  });
  if (!res.ok) throw new PbError(res.status, await res.text());
  const data = (await res.json()) as { token: string };
  superuserToken = { token: data.token, expMs: jwtExpMs(data.token) };
  return data.token;
}

/** pockethost rate-limits /api (429) and cold-starts sporadically — retry. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Superuser fetch against the PB REST API. */
export async function pb<T = unknown>(
  env: Env,
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = await superuserAuth(env);
  const res = await fetch(`${env.PB_URL}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && retry) {
    await superuserAuth(env, true);
    return pb<T>(env, path, init, false);
  }
  if (res.status === 429 && retry) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '10');
    await sleep(Math.min(30, Math.max(2, retryAfter)) * 1000);
    return pb<T>(env, path, init, false);
  }
  if (!res.ok) throw new PbError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface PbUser {
  id: string;
  name?: string;
  email?: string;
  intervals_athlete_id?: string;
  intervals_api_key?: string;
  openrouter_api_key?: string;
  preferred_model?: string;
  units?: 'km' | 'mi';
  athlete_profile?: string;
}

/** Validate the caller's token; returns their users record (or null). */
export async function userFromToken(
  env: Env,
  bearer: string | null,
): Promise<PbUser | null> {
  if (!bearer) return null;
  const res = await fetch(`${env.PB_URL}/api/collections/users/auth-refresh`, {
    method: 'POST',
    headers: { Authorization: bearer },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { record?: PbUser };
  const record = data.record ?? null;
  if (!record?.id) return null;
  // hidden fields (api keys) are stripped for regular auth — reload as superuser
  return pb<PbUser>(env, `/api/collections/users/records/${record.id}`);
}

// ---------- typed record helpers (field subsets; mirrors use `data` JSON) ----------

export interface PbRecord {
  id: string;
  [k: string]: unknown;
}

export async function listRecords(
  env: Env,
  collection: string,
  filter: string,
  extra = '',
): Promise<PbRecord[]> {
  const data = await pb<{ items: PbRecord[] }>(
    env,
    `/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}${extra}`,
  );
  return data.items ?? [];
}

export async function getFirst(
  env: Env,
  collection: string,
  filter: string,
): Promise<PbRecord | null> {
  const items = await listRecords(env, collection, filter, '&perPage=1');
  return items[0] ?? null;
}

export async function createRecord(
  env: Env,
  collection: string,
  body: Record<string, unknown>,
): Promise<PbRecord> {
  return pb<PbRecord>(env, `/api/collections/${collection}/records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateRecord(
  env: Env,
  collection: string,
  id: string,
  body: Record<string, unknown>,
): Promise<PbRecord> {
  return pb<PbRecord>(env, `/api/collections/${collection}/records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** PB filter string for records by owner. */
export const byUser = (userId: string) => `user="${userId}"`;
