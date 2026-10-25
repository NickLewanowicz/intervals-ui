/**
 * intervals-coach — coach API (ADR-0003).
 *
 * Ships as a Cloudflare Pages Function (`_worker.js` advanced mode) on the
 * `intervals` Pages project — same origin as the app (intervals.imnick.dev/api/*).
 * The standalone-Worker shape (fetch + scheduled) is kept so it can be lifted
 * to a dedicated Worker + cron trigger without code changes once a
 * Workers-scoped CF token exists; until then the 6-hourly sync is driven by
 * the Gitea Actions schedule calling GET /api/cron with X-Cron-Secret.
 *
 * Routes (all /api/*, Bearer = the user's PocketBase token unless noted):
 *   GET  /api/health            — liveness (no auth)
 *   GET  /api/cron              — run the sync loop (X-Cron-Secret header)
 *   POST /api/chat              — coach turn (SSE stream: delta|proposal|error|done)
 *   GET  /api/proposals         — list proposals (default: pending)
 *   POST /api/proposals/:id/apply    — write the proposal to intervals.icu
 *   POST /api/proposals/:id/dismiss  — drop it
 *   POST /api/sync              — pull the user's intervals.icu data into PB now
 *
 * Non-/api requests fall through to static assets (the Expo web export).
 *
 * BYO keys: the OpenRouter key and intervals.icu key live on the user's PB
 * record; this API only ever proxies them server-side (never to the client).
 */
import {
  COACH_TOOLS,
  OPENROUTER_CHAT_URL,
  buildCoachSystemPrompt,
  createIntervalsClient,
  openRouterFetchInit,
  resolveModel,
  validateProposal,
  coachUid,
  ProposalValidationError,
} from '@intervals/core';
import type { OpenRouterMessage } from '@intervals/core';
import { calendarDigest, vdotDigest, wellnessDigest, zonesDigest } from './coach';
import {
  byUser,
  createRecord,
  getFirst,
  listRecords,
  updateRecord,
  userFromToken,
  type Env,
  type PbRecord,
  type PbUser,
} from './pb';
import { cronSync, syncUser, upsertSyncState } from './sync';

const ALLOWED_ORIGINS = [
  'https://intervals.imnick.dev',
  'https://intervals-356.pages.dev',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:5173',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Cron-Secret',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data: unknown, status = 200, cors: Record<string, string>) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });

export default {
  async fetch(
    request: Request,
    env: Env & { ASSETS?: { fetch(request: Request): Promise<Response> } },
    ctx: ExecutionContext,
  ): Promise<Response> {
    const cors = corsHeaders(request.headers.get('Origin'));
    const url = new URL(request.url);

    // Advanced-mode _worker.js handles every request; let non-API paths
    // fall through to the static asset serving binding.
    if (!url.pathname.startsWith('/api')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('not found', { status: 404 });
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/api/health') return json({ ok: true }, 200, cors);

    if (url.pathname === '/api/cron' && request.method === 'GET') {
      if (request.headers.get('X-Cron-Secret') !== env.CRON_SECRET) {
        return json({ error: 'forbidden' }, 403, cors);
      }
      ctx.waitUntil(cronSync(env));
      return json({ ok: true, started: true }, 200, cors);
    }

    const bearer = request.headers.get('Authorization');
    const user = await userFromToken(env, bearer);
    if (!user) return json({ error: 'unauthorized' }, 401, cors);

    if (url.pathname === '/api/chat' && request.method === 'POST') return chat(request, env, user, cors);
    if (url.pathname === '/api/sync' && request.method === 'POST') return manualSync(env, user, cors);
    if (url.pathname === '/api/proposals' && request.method === 'GET') return listProposals(env, user, url, cors);
    const proposalMatch = url.pathname.match(/^\/api\/proposals\/([\w]+)\/(apply|dismiss)$/);
    if (proposalMatch && request.method === 'POST') {
      return proposalAction(proposalMatch[1]!, proposalMatch[2] as 'apply' | 'dismiss', env, user, cors);
    }
    return json({ error: 'not_found' }, 404, cors);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cronSync(env));
  },
};

// ---------- sync ----------

async function manualSync(env: Env, user: PbUser, cors: Record<string, string>): Promise<Response> {
  if (!user.intervals_api_key) return json({ error: 'missing_intervals_key' }, 400, cors);
  try {
    const result = await syncUser(env, user.id, user.intervals_api_key, user.intervals_athlete_id || undefined);
    return json({ ok: true, ...result }, 200, cors);
  } catch (e) {
    return json({ error: 'sync_failed', detail: String(e).slice(0, 300) }, 502, cors);
  }
}

// ---------- proposals ----------

async function listProposals(env: Env, user: PbUser, url: URL, cors: Record<string, string>): Promise<Response> {
  const status = url.searchParams.get('status') ?? 'pending';
  const items = await listRecords(
    env,
    'proposals',
    `${byUser(user.id)} && status="${status}"`,
    '&sort=-created&perPage=50',
  );
  return json({ items }, 200, cors);
}

async function proposalAction(
  id: string,
  action: 'apply' | 'dismiss',
  env: Env,
  user: PbUser,
  cors: Record<string, string>,
): Promise<Response> {
  const record = await getFirst(env, 'proposals', `${byUser(user.id)} && id="${id}"`);
  if (!record) return json({ error: 'not_found' }, 404, cors);
  if (record.status !== 'pending') return json({ error: 'already_resolved', status: record.status }, 409, cors);

  if (action === 'dismiss') {
    const updated = await updateRecord(env, 'proposals', id, { status: 'dismissed' });
    return json({ ok: true, proposal: updated }, 200, cors);
  }

  if (!user.intervals_api_key) return json({ error: 'missing_intervals_key' }, 400, cors);
  const client = createIntervalsClient({
    apiKey: user.intervals_api_key,
    athleteId: user.intervals_athlete_id || '0',
  });
  const kind = String(record.kind) as 'create_event' | 'update_event' | 'delete_event';
  const payload = (record.payload ?? {}) as Record<string, unknown>;

  try {
    let eventId: number | undefined;
    if (kind === 'create_event') {
      // payload was validated into an EventEx at proposal-creation time
      const body = {
        ...payload,
        uid: (payload.uid as string) ?? coachUid(user.id + ':' + String(record.session ?? ''), String(payload.start_date_local) + String(payload.name)),
      } as unknown as import('@intervals/core').EventEx;
      const created = await client.createEvent(body, true);
      eventId = created?.id;
    } else if (kind === 'update_event') {
      const eventIdNum = payload.id as number;
      const body = { ...payload };
      delete body.id;
      delete body.uid;
      await client.updateEvent(eventIdNum, body);
      eventId = eventIdNum;
    } else {
      await client.deleteEvent(payload.id as number);
      eventId = payload.id as number;
    }
    const updated = await updateRecord(env, 'proposals', id, {
      status: 'applied',
      intervals_event_id: eventId ?? null,
      applied_at: new Date().toISOString(),
    });
    // Refresh the PB mirror for this user so the calendar updates immediately
    // (best effort — the 6h cron is the backstop).
    syncUser(env, user.id, user.intervals_api_key, user.intervals_athlete_id || undefined).catch(() => {});
    return json({ ok: true, proposal: updated }, 200, cors);
  } catch (e) {
    await updateRecord(env, 'proposals', id, {
      status: 'failed',
      error: String(e).slice(0, 500),
    }).catch(() => {});
    return json({ error: 'apply_failed', detail: String(e).slice(0, 300) }, 502, cors);
  }
}

// ---------- chat ----------

interface ChatRequestBody {
  session_id?: string;
  message: string;
  model?: string;
}

const HISTORY_MESSAGES = 20;

async function chat(request: Request, env: Env, user: PbUser, cors: Record<string, string>): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return json({ error: 'bad_json' }, 400, cors);
  }
  const message = (body.message ?? '').trim();
  if (!message) return json({ error: 'empty_message' }, 400, cors);
  if (!user.openrouter_api_key) return json({ error: 'missing_openrouter_key' }, 400, cors);

  // session (create on first turn)
  let sessionId = body.session_id;
  let session: PbRecord | null = null;
  if (sessionId) session = await getFirst(env, 'chat_sessions', `${byUser(user.id)} && id="${sessionId}"`);
  if (!session) {
    session = await createRecord(env, 'chat_sessions', {
      user: user.id,
      title: message.slice(0, 60),
      model: body.model ?? user.preferred_model ?? undefined,
    });
    sessionId = session.id;
  }

  // context digests from the PB mirrors (skip silently when not connected)
  let calDigest = '(no intervals.icu account connected — ask the athlete to connect one in Settings; you can still talk training)';
  let wellDigest = '(no wellness data)';
  let zDigest = '(no zone settings)';
  let vDigest: string | null = null;
  if (user.intervals_api_key) {
    const now = new Date();
    const back = new Date(now.getTime() - 21 * 86400_000).toISOString().slice(0, 10);
    const fwd = new Date(now.getTime() + 90 * 86400_000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const [evRows, acRows, wRows, zRow] = await Promise.all([
      listRecords(env, 'calendar_events', `${byUser(user.id)} && start_date_local >= "${back}T00:00:00" && start_date_local <= "${fwd}T23:59:59"`, '&sort=start_date_local&perPage=300'),
      listRecords(env, 'activities', `${byUser(user.id)} && start_date_local >= "${back}T00:00:00" && start_date_local <= "${today}T23:59:59"`, '&sort=-start_date_local&perPage=150'),
      listRecords(env, 'wellness', byUser(user.id), '&sort=-date&perPage=14'),
      getFirst(env, 'sport_settings', byUser(user.id)),
    ]);
    calDigest = calendarDigest(
      evRows.map((r) => ({ ...(r.data as object), intervals_id: r.intervals_id }) as never),
      acRows.map((r) => r.data as never),
    );
    wellDigest = wellnessDigest(wRows.map((r) => ({ ...(r.data as object), date: r.date }) as never));
    zDigest = zonesDigest((zRow?.data as never) ?? null);
    vDigest = vdotDigest(
      acRows.map((r) => r.data as never),
      now,
    );
  }

  const system = buildCoachSystemPrompt({
    athleteName: user.name,
    today: new Date().toISOString().slice(0, 10),
    units: user.units ?? 'km',
    calendarDigest: calDigest,
    wellnessDigest: wellDigest,
    zonesDigest: zDigest,
    vdotDigest: vDigest ?? undefined,
    athleteProfile: user.athlete_profile ?? '',
  });

  // history + this turn
  const history = await listRecords(
    env,
    'chat_messages',
    `session="${sessionId}"`,
    '&sort=created&perPage=100',
  );
  const priorMessages: OpenRouterMessage[] = history
    .slice(-HISTORY_MESSAGES)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: String(m.content ?? ''),
    }));
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: system },
    ...priorMessages,
    { role: 'user', content: message },
  ];

  await createRecord(env, 'chat_messages', {
    session: sessionId,
    user: user.id,
    role: 'user',
    content: message,
  });

  const model = resolveModel(body.model ?? user.preferred_model);
  const upstream = await fetch(
    OPENROUTER_CHAT_URL,
    openRouterFetchInit({
      apiKey: user.openrouter_api_key,
      model,
      messages,
      tools: COACH_TOOLS,
      stream: true,
    }),
  );
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: 'openrouter_failed', status: upstream.status, detail: detail.slice(0, 300) }, 502, cors);
  }

  const sessionIdFinal = sessionId;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let full = '';
      const toolCalls: Array<{ id: string; name: string; args: string }> = [];
      let usage: Record<string, unknown> | null = null;

      try {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            let chunk: any;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }
            if (chunk.usage) usage = chunk.usage;
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.content) {
              full += delta.content;
              send('delta', { text: delta.content });
            }
            for (const tc of delta.tool_calls ?? []) {
              const idx: number = tc.index ?? 0;
              toolCalls[idx] = toolCalls[idx] ?? { id: '', name: '', args: '' };
              if (tc.id) toolCalls[idx]!.id = tc.id;
              if (tc.function?.name) toolCalls[idx]!.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx]!.args += tc.function.arguments;
            }
          }
        }

        // persist assistant message
        await createRecord(env, 'chat_messages', {
          session: sessionIdFinal,
          user: user.id,
          role: 'assistant',
          content: full,
          tool_calls: toolCalls.length
            ? toolCalls.map((t) => ({ id: t.id, function: { name: t.name, arguments: t.args } }))
            : null,
          usage,
        });

        // tool calls → proposals (validated; invalid ones reported, not fatal)
        const proposalErrors: Array<{ tool: string; error: string }> = [];
        for (const tc of toolCalls) {
          if (!tc?.name) continue;
          let args: unknown;
          try {
            args = JSON.parse(tc.args || '{}');
          } catch {
            proposalErrors.push({ tool: tc.name, error: 'unparseable tool arguments' });
            continue;
          }
          try {
            const { kind, payload, rationale } = validateProposal(tc.name, args);
            const proposal = await createRecord(env, 'proposals', {
              user: user.id,
              session: sessionIdFinal,
              kind,
              payload,
              rationale: rationale ?? null,
              status: 'pending',
            });
            send('proposal', { id: proposal.id, kind, payload, rationale });
          } catch (e) {
            if (e instanceof ProposalValidationError) {
              proposalErrors.push({ tool: tc.name, error: e.message });
            } else throw e;
          }
        }
        send('done', { session_id: sessionIdFinal, usage, proposal_errors: proposalErrors });
      } catch (e) {
        send('error', { message: String(e).slice(0, 300) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...cors,
    },
  });
}
