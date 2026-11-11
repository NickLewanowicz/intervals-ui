/**
 * QA mock COACH API — stands in for the real worker at EXPO_PUBLIC_WORKER_URL.
 * OpenRouter-compatible chat (deterministic mock, or budget-guarded real proxy
 * when QA_REAL_LLM_KEY is set) + the proposal/sync endpoints the app calls,
 * backed by the LOCAL QA PocketBase (127.0.0.1:8090) as superuser.
 * CORS: allow-all (QA only).
 *
 * Usage: node tools/qa_mock_worker.mjs [port]
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || 8099);
const PB = process.env.QA_PB_URL || 'http://127.0.0.1:8090';
const SUPER = { identity: process.env.QA_PB_EMAIL || 'qa-admin@intervals.test', password: process.env.QA_PB_PASSWORD || 'qa-admin-pass' };
const REAL_KEY = process.env.QA_REAL_LLM_KEY || '';
const REAL_BUDGET_USD = Number(process.env.QA_REAL_LLM_BUDGET_USD || 0.35);
let realSpend = 0;
let superTok = null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
};

async function superuser() {
  // FIX(devon-qa): self-heal after a stack reset — a cached token from a dead
  // PB instance 401s forever; re-auth when the cached one stops refreshing.
  if (superTok) {
    const ok = await fetch(`${PB}/api/collections/_superusers/auth-refresh`, {
      method: 'POST', headers: { Authorization: superTok },
    }).then((r) => r.ok).catch(() => false);
    if (ok) return superTok;
    superTok = null;
  }
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(SUPER),
  });
  superTok = (await r.json()).token;
  return superTok;
}
const pbJson = async (method, path, body, bearer) => {
  const headers = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = bearer;
  const r = await fetch(`${PB}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
};

// Applied create_event proposals land on the LOCAL mirror (the real worker
// writes intervals.icu and the cron re-syncs the mirror — QA collapses that
// into one write so the calendar shows the applied run immediately).
async function applyMirrorEvent(row, su) {
  if (row?.kind !== 'create_event' || !row?.payload) return;
  const p = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  await pbJson('POST', '/api/collections/calendar_events/records', {
    user: row.user,
    intervals_id: 900000 + (Date.now() % 100000),
    ...p,
    data: p,
  }, su).catch(() => {});
}

const Reply = (msg) => {
  const m = (msg || '').toLowerCase();
  if (m.includes('week') || m.includes('adjust'))
    return "Here's your week: three easy runs, one interval session Tuesday, and the long run Saturday. You're at 38km planned with a load of 142 — inside your hold-flat range, so hold the plan unless your legs say otherwise.";
  if (m.includes('plan') && m.includes('race'))
    return 'Plan sketch: base week, build week with race-pace work, then taper. Want me to lay the first week onto your calendar?';
  if (m.includes('fuel'))
    return 'For a 2-hour effort: 40-60g carbs/hour starting 20 minutes in, practiced on your long run first. Nothing new on race day.';
  return 'Looking at your calendar and recovery, the easy runs this week look right — keep them conversational and let Tuesday be the only hard effort.';
};

function mockStream(res, messages, withTools) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', ...CORS });
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const msg = lastUser?.content || '';
  if (withTools && /add|schedule|move|cut|drop|remove|trim/i.test(msg)) {
    const chunks = [
      { delta: { tool_calls: [{ index: 0, id: 'mock-call-1', function: { name: 'propose_event', arguments: '' } }] } },
      { delta: { tool_calls: [{ index: 0, function: { arguments: '{"start_date_local":"2026-11-03T07:00","name":"Easy mock run","category":"WORKOUT","type":"Run","description":"- 5km Z2 Pace","distance":5000,"moving_time":1800,"rationale":"Mock proposal from the QA stack."}' } }] } },
      { delta: { content: 'I proposed an easy 5km run on Monday — approve it if it looks right.' } },
    ];
    for (const c of chunks) res.write(`data: ${JSON.stringify({ choices: [{ delta: c.delta }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 40 } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  const words = Reply(msg).split(' ');
  let i = 0;
  const tick = () => {
    if (i >= words.length) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 120, completion_tokens: words.length } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (i ? ' ' : '') + words[i++] } }] })}\n\n`);
    setTimeout(tick, 12);
  };
  tick();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const done = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify(data));
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  if (url.pathname === '/health') return done(200, { ok: true, realSpend });
  if (url.pathname === '/v1/key') return done(200, { data: { limit_remaining: Math.max(0, REAL_BUDGET_USD - realSpend) } });

  // ---- chat (mock or budget-guarded real proxy) ----
  if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const wantsTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;

    if (REAL_KEY && realSpend < REAL_BUDGET_USD) {
      const up = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${REAL_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://intervals.imnick.dev' },
        body: JSON.stringify({ ...parsed, stream: true }),
      });
      res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') || 'text/event-stream', ...CORS });
      const reader = up.body.getReader();
      let inT = 0, outT = 0;
      for (;;) {
        const { done: d, value } = await reader.read();
        if (d) break;
        res.write(value);
        for (const line of new TextDecoder().decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { const j = JSON.parse(line.slice(6)); if (j.usage) { inT += j.usage.prompt_tokens || 0; outT += j.usage.completion_tokens || 0; } } catch {}
        }
      }
      res.end();
      realSpend += (inT / 1e6) * 0.15 + (outT / 1e6) * 0.5;
      console.log(`[qa] real LLM $${realSpend.toFixed(4)}/$${REAL_BUDGET_USD}`);
      return;
    }
    return mockStream(res, parsed.messages || [], wantsTools);
  }

  // ---- auth: accept the Bearer token as a local PB user token ----
  if (url.pathname.startsWith('/api/')) {
    const bearer = (req.headers.get?.('authorization') || req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const auth = await pbJson('POST', '/api/collections/users/auth-refresh', undefined, bearer).catch(() => ({ status: 401, json: null }));
    const user = auth.status === 200 ? auth.json.record : null;
    if (!user) return done(401, { error: 'unauthorized' });
    const uid = user.id;
    const json2 = (data, code = 200) => done(code, data);

    if (url.pathname === '/api/sync' && req.method === 'POST')
      return json2({ ok: true, events: 0, activities: 0, wellness: 0 });

    if (url.pathname === '/api/proposals' && req.method === 'GET') {
      const status = url.searchParams.get('status') || 'pending';
      // FIX(devon-qa): list/read rules are owner-scoped — pass the caller's
      // bearer or PB 403s and this silently returned [] forever.
      const rows = await pbJson('GET', `/api/collections/proposals/records?filter=${encodeURIComponent(`user="${uid}" && status="${status}"`)}&sort=-created&perPage=50`, undefined, bearer);
      return json2({ items: rows.json?.items ?? [] });
    }
    const applyMatch = url.pathname.match(/^\/api\/proposals\/apply-batch$/) || url.pathname.match(/^\/api\/proposals\/dismiss-batch$/);
    if (applyMatch && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      const { ids = [] } = JSON.parse(body || '{}');
      const action = url.pathname.includes('dismiss') ? 'dismissed' : 'applied';
      const results = [];
      // FIX(devon-qa): proposals.updateRule is null (superuser-only by design —
      // status transitions belong to the apply path), so these PATCHes must go
      // as superuser, not unauthenticated.
      const su = await superuser();
      for (const id of ids) {
        const r = await pbJson('PATCH', `/api/collections/proposals/records/${id}`, { status: action }, su);
        results.push({ id, ok: r.status === 200, status: r.status === 200 ? action : undefined });
        if (action === 'applied') await applyMirrorEvent(r.json, su);
      }
      return json2({ ok: results.every((r) => r.ok), results });
    }
    const single = url.pathname.match(/^\/api\/proposals\/([\w]+)\/(apply|dismiss)$/);
    if (single && req.method === 'POST') {
      const su = await superuser();
      const r = await pbJson('PATCH', `/api/collections/proposals/records/${single[1]}`, { status: single[2] === 'apply' ? 'applied' : 'dismissed' }, su);
      if (single[2] === 'apply') await applyMirrorEvent(r.json, su);
      return json2({ ok: r.status === 200, proposal: r.json }, r.status === 200 ? 200 : 400);
    }

    // ---- chat persistence + mock streaming (the app's chat path) ----
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      const parsed = JSON.parse(body || '{}');
      // FIX(devon-qa): chat_sessions/messages/proposals create rules are
      // owner-scoped — the caller's bearer must ride along or every write
      // 403s (sessions never persisted, done carried no session_id, and the
      // proposal SSE event shipped with no id/payload).
      const sessionId = parsed.session_id || (await pbJson('POST', '/api/collections/chat_sessions/records', { user: uid, title: (parsed.message || '').slice(0, 60) }, bearer)).json.id;
      await pbJson('POST', '/api/collections/chat_messages/records', { user: uid, session: sessionId, role: 'user', content: parsed.message }, bearer);
      const messages = [
        { role: 'system', content: 'You are Coach.' },
        ...((parsed.history || []).slice(-10)),
        { role: 'user', content: parsed.message },
      ];
      res.writeHead(200, { 'Content-Type': 'text/event-stream', ...CORS });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      // use the built-in mock reply (never spends OpenRouter budget)
      const words = Reply(parsed.message).split(' ');
      let full = '';
      let i = 0;
      await new Promise((resolve) => {
        const tick = () => {
          if (i >= words.length) { resolve(); return; }
          const piece = (i ? ' ' : '') + words[i++];
          full += piece;
          send('delta', { text: piece });
          setTimeout(tick, 10);
        };
        tick();
      });
      await pbJson('POST', '/api/collections/chat_messages/records', { user: uid, session: sessionId, role: 'assistant', content: full }, bearer);
      if (/add|schedule|cut|move|trim/i.test(parsed.message)) {
        const p = await pbJson('POST', '/api/collections/proposals/records', {
          user: uid, session: sessionId, kind: 'create_event',
          payload: { start_date_local: '2026-11-03T07:00:00', name: 'Easy mock run', category: 'WORKOUT', type: 'Run', description: '- 5km Z2 Pace', distance: 5000, moving_time: 1800 },
          rationale: 'Mock proposal from the QA stack.', status: 'pending',
        }, bearer);
        send('proposal', { id: p.json.id, kind: 'create_event', payload: p.json.payload, rationale: p.json.rationale });
      }
      send('done', { session_id: sessionId, usage: { prompt_tokens: 100, completion_tokens: 50 }, proposal_errors: [] });
      res.end();
      return;
    }
  }
  res.writeHead(404, CORS);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => console.log(`qa mock worker on :${PORT} (real-proxy ${REAL_KEY ? 'ARMED $' + REAL_BUDGET_USD : 'off'})`));
