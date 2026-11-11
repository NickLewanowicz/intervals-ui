/**
 * QA mock LLM server — an OpenRouter-compatible stub for flow QA.
 *
 * Serves POST /v1/chat/completions (streaming SSE + usage) and /health.
 * Replies are deterministic persona-aware training-coach chatter with the
 * SAME event shapes the app parses (delta/tool_calls/done). Optionally can
 * proxy to real OpenRouter when QA_REAL_LLM_KEY is set — used only for
 * feedback-quality persona runs, with the budget guard in qa_swarm.mjs.
 *
 * Usage: node tools/qa_mock_llm.mjs [port]
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || 8099);
const REAL_KEY = process.env.QA_REAL_LLM_KEY || '';
const REAL_MODEL = process.env.QA_REAL_LLM_MODEL || 'z-ai/glm-5.3-flash';
const REAL_BUDGET_USD = Number(process.env.QA_REAL_LLM_BUDGET_USD || 0.5);
let realSpend = 0;

// rough per-model $/1M in/out (matches packages/core roster pricing notes)
const PRICES = {
  'z-ai/glm-5.3-flash': [0.15, 0.5],
  'anthropic/claude-haiku-5.5': [0.1, 0.5],
  'deepseek/deepseek-v4.1-flash-1017': [0.15, 0.6],
};
const price = (model) => PRICES[model] || [0.15, 0.5];

const Reply = (msg) => {
  const m = (msg || '').toLowerCase();
  if (m.includes('week') || m.includes('adjust'))
    return "Here's your week: three easy runs, one interval session Tuesday, and the long run Saturday. You're at 38km planned with a load of 142 — that's inside your hold-flat range, so hold the plan unless your legs say otherwise.";
  if (m.includes('plan') && m.includes('race'))
    return 'Plan sketch: base week, build week with race-pace work, then taper. Want me to lay the first week onto your calendar?';
  if (m.includes('fuel'))
    return 'For a 2-hour effort: 40-60g carbs/hour starting 20 minutes in, practiced on your long run first. Nothing new on race day.';
  return 'Looking at your calendar and recovery, the easy runs this week look right — keep them conversational and let the Tuesday session be the only hard effort.';
};

function sse(res, model, messages, withTools) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const reply = Reply(lastUser?.content);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  // tool-call path: persona asked for a calendar change
  if (withTools && /add|schedule|move|cut|drop|remove/i.test(lastUser?.content || '')) {
    // next Thursday 07:00 local (always in the current week+, never stale)
    const thursday = new Date();
    thursday.setUTCDate(thursday.getUTCDate() + ((4 - thursday.getUTCDay() + 7) % 7 || 7));
    const thursdayIso = thursday.toISOString().slice(0, 10) + 'T07:00';
    const chunks = [
      { delta: { tool_calls: [{ index: 0, id: 'mock-call-1', function: { name: 'propose_event', arguments: '' } }] } },
      { delta: { tool_calls: [{ index: 0, function: { arguments: `{"start_date_local":"${thursdayIso}","name":"Easy 5km","category":"WORKOUT","type":"Run","description":"- 5km easy, conversational pace\\n- 4 relaxed strides after","distance":5000,"moving_time":1800,"rationale":"Recovery between the Tuesday intervals and the Saturday tempo."}` } }] } },
      { delta: { content: 'I proposed an easy 5km on Thursday morning — approve it if it looks right.' } },
    ];
    for (const c of chunks) res.write(`data: ${JSON.stringify({ choices: [{ delta: c.delta }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  // plain text path: stream word-by-word
  const words = reply.split(' ');
  let i = 0;
  const tick = () => {
    if (i >= words.length) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 120, completion_tokens: words.length } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    const piece = (i ? ' ' : '') + words[i++];
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
    setTimeout(tick, 12);
  };
  tick();
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, realSpend }));
    return;
  }
  if (req.url === '/v1/key') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { limit_remaining: Math.max(0, REAL_BUDGET_USD - realSpend) } }));
    return;
  }
  if (req.url?.includes('/chat/completions')) {
    // the app's DIRECT chat path fetches us from the browser (localhost:8091)
    // — mirror OpenRouter's permissive CORS or the preflight/fetch fails and
    // the turn silently falls back to the worker transport
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
  }
  if (req.url?.includes('/chat/completions') && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const wantsTools = Array.isArray(parsed.tools) && parsed.tools.length > 0;

    if (REAL_KEY && realSpend < REAL_BUDGET_USD) {
      // proxy to real OpenRouter for feedback-quality runs (budget-guarded)
      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${REAL_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://intervals.imnick.dev',
          'X-Title': 'intervals QA stack',
        },
        body: JSON.stringify({ ...parsed, stream: true }),
      });
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'text/event-stream' });
      let inTok = 0, outTok = 0;
      const [modelIn, modelOut] = price(parsed.model || REAL_MODEL);
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        const text = new TextDecoder().decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(line.slice(6));
            if (j.usage) { inTok += j.usage.prompt_tokens || 0; outTok += j.usage.completion_tokens || 0; }
          } catch {}
        }
      }
      res.end();
      const spend = (inTok / 1e6) * modelIn + (outTok / 1e6) * modelOut;
      realSpend += spend;
      console.log(`[qa-llm] real call: ${inTok}in/${outTok}out = $${spend.toFixed(4)} (swarm spend $${realSpend.toFixed(4)} / $${REAL_BUDGET_USD})`);
      if (realSpend >= REAL_BUDGET_USD) console.log('[qa-llm] BUDGET REACHED — falling back to mock replies');
      return;
    }

    sse(res, parsed.model, parsed.messages, wantsTools);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => console.log(`qa mock LLM on :${PORT} (real-key proxy ${REAL_KEY ? 'ARMED, budget $' + REAL_BUDGET_USD : 'off'})`));
