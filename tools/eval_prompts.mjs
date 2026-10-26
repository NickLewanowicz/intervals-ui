/**
 * Coach prompt/model eval harness (persona: coach-tuner).
 *
 * Runs fixture scenarios through the CURRENT prompt + a candidate model on
 * OpenRouter (real calls, key from .env OPENROUTER_API_KEY) and scores:
 *   - tool-call contract: every emitted proposal validates (proposal.ts rules)
 *   - proposal correctness vs fixture expectations (kind/category/date/name)
 *   - noWrite: model must NOT call tools when the fixture forbids it
 *   - mustMention: strings the reply must contain
 *
 * SAFETY: this harness NEVER writes to intervals.icu (no intervals API calls
 * at all — proposals are validated in-memory only). Non-negotiable.
 *
 * Usage:
 *   node tools/eval_prompts.mjs [--model <id>] [--fixtures <glob>] [--prompt-file <path>]
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// ---- bundle core (TS) into an importable ESM file --------------------------
const tmpBundle = new URL('../.scratch/evals/core-bundle.mjs', import.meta.url).pathname;
mkdirSync(new URL('../.scratch/evals/', import.meta.url).pathname, { recursive: true });
await build({
  entryPoints: [
    {
      in: new URL('../packages/core/src/index.ts', import.meta.url).pathname,
      out: 'core-bundle',
    },
  ],
  outdir: new URL('../.scratch/evals/', import.meta.url).pathname,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: true,
});
const core = await import(tmpBundle);
const { buildCoachSystemPrompt, COACH_TOOLS, resolveModel, validateProposal, ProposalValidationError, DEFAULT_MODEL_ID } = core;

// ---- args + env -------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = (() => {
  const dot = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  return Object.fromEntries(
    dot.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
})();
const MODEL = arg('model') ? resolveModel(arg('model')) : resolveModel(undefined);
const FIXTURES_DIR = arg('fixtures') || new URL('../.scratch/evals/fixtures/', import.meta.url).pathname;
const API_KEY = env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('OPENROUTER_API_KEY missing from .env');
  process.exit(1);
}

// optional alternate prompt module (A/B): a .mjs exporting buildCoachSystemPrompt
let promptBuilder = buildCoachSystemPrompt;
const promptFile = arg('prompt-file');
if (promptFile) {
  const mod = await import(new URL(promptFile, `file://${process.cwd()}/`).href);
  promptBuilder = mod.buildCoachSystemPrompt;
  if (!promptBuilder) {
    console.error('prompt-file must export buildCoachSystemPrompt');
    process.exit(1);
  }
}

// ---- run fixtures -----------------------------------------------------------
const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
if (!files.length) {
  console.error(`no fixtures in ${FIXTURES_DIR} — see .scratch/evals/fixtures/*.json`);
  process.exit(1);
}

const results = [];
for (const file of files) {
  const fx = JSON.parse(readFileSync(FIXTURES_DIR + file, 'utf8'));
  const system = promptBuilder({ athleteName: fx.athleteName, ...fx.athleteContext });
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://intervals.imnick.dev',
      'X-Title': 'intervals eval',
    },
    body: JSON.stringify({
      model: MODEL.id,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: fx.userMessage },
      ],
      tools: COACH_TOOLS,
      tool_choice: 'auto',
      provider: { sort: 'throughput', require_parameters: true },
      ...(MODEL.reasoningEffort ? { reasoning: { effort: MODEL.reasoningEffort } } : {}),
    }),
  });
  if (!res.ok) {
    results.push({ fixture: file, pass: false, errors: [`openrouter ${res.status}: ${(await res.text()).slice(0, 120)}`] });
    continue;
  }
  const data = await res.json();
  const msg = data.choices?.[0]?.message ?? {};
  const text = msg.content ?? '';
  const toolCalls = msg.tool_calls ?? [];
  const checks = [];
  const expect = fx.expect ?? {};

  // noWrite: no tool calls allowed
  if (expect.noWrite) {
    checks.push({
      ok: toolCalls.length === 0,
      label: `noWrite (got ${toolCalls.length} tool calls)`,
    });
  }

  // every tool call must validate
  const validated = [];
  for (const tc of toolCalls) {
    try {
      const p = validateProposal(tc.function.name, JSON.parse(tc.function.arguments || '{}'));
      validated.push(p);
      checks.push({ ok: true, label: `valid proposal: ${p.kind}` });
    } catch (e) {
      checks.push({
        ok: false,
        label: `INVALID tool call ${tc.function?.name}: ${e instanceof ProposalValidationError ? e.message : String(e)}`,
      });
    }
  }

  // expected proposals
  for (const want of expect.proposals ?? []) {
    const match = validated.find(
      (p) =>
        (!want.kind || p.kind === want.kind) &&
        (!want.category || p.payload.category === want.category) &&
        (!want.date || p.payload.start_date_local?.startsWith(want.date)) &&
        // updates may omit start_date_local when unchanged — id is the contract
        (want.id == null || p.payload.id === want.id),
    );
    checks.push({ ok: !!match, label: `proposal ${want.kind ?? ''}/${want.category ?? ''}${want.date ? ' on ' + want.date : ''}${want.id != null ? ' id ' + want.id : ''} ${match ? '✓' : 'MISSING'}` });
    if (match && want.nameIncludes && !String(match.payload.name ?? '').toLowerCase().includes(want.nameIncludes.toLowerCase())) {
      checks.push({ ok: false, label: `name should include "${want.nameIncludes}", got "${match.payload.name}"` });
    }
  }

  // mustMention strings
  for (const s of expect.mustMention ?? []) {
    checks.push({ ok: text.toLowerCase().includes(s.toLowerCase()), label: `mentions "${s}"` });
  }

  // bundle coherence: only when the fixture EXPECTS a bundle (multi-week
  // plans are deliberately unbundled — sessions stay individually steerable)
  if (expect.bundle && validated.length >= 2) {
    const bundled = validated.filter((p) => p.bundle);
    const keys = new Set(bundled.map((p) => (p.bundle ? p.bundle.key : '')));
    checks.push({
      ok: bundled.length === validated.length && keys.size === 1,
      label: `bundle coherence: ${bundled.length}/${validated.length} bundled, ${keys.size} distinct key(s)`,
    });
  }

  const usage = data.usage ?? {};
  results.push({
    fixture: file,
    pass: checks.every((c) => c.ok),
    checks,
    usage,
    reply: text.slice(0, 300),
  });
}

// ---- report -----------------------------------------------------------------
let totalIn = 0, totalOut = 0, allOk = true;
console.log(`\n=== eval: model=${MODEL.id} | fixtures=${results.length} ===\n`);
for (const r of results) {
  allOk = allOk && r.pass;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.fixture}`);
  for (const c of r.checks ?? []) console.log(`      ${c.ok ? '✓' : '✗'} ${c.label}`);
  for (const e of r.errors ?? []) console.log(`      ✗ ${e}`);
  totalIn += r.usage?.prompt_tokens ?? 0;
  totalOut += r.usage?.completion_tokens ?? 0;
}
console.log(`\ntokens: ${totalIn} in / ${totalOut} out`);

// append to the eval log (docs/research/eval-log.md)
const logPath = new URL('../docs/research/eval-log.md', import.meta.url).pathname;
const stamp = new Date().toISOString();
const lines = [
  `\n## ${stamp} — ${MODEL.id} (${results.length} fixtures, ${allOk ? 'ALL PASS' : 'FAILURES'})`,
  `- tokens: ${totalIn} in / ${totalOut} out`,
  ...results.map((r) => `- ${r.pass ? '✅' : '❌'} ${r.fixture}${r.pass ? '' : ': ' + (r.checks ?? []).filter((c) => !c.ok).map((c) => c.label).join('; ') + (r.errors ?? []).join('; ')}`),
];
mkdirSync(new URL('../docs/research/', import.meta.url).pathname, { recursive: true });
writeFileSync(logPath, lines.join('\n') + '\n', { flag: 'a' });
console.log(`log appended → docs/research/eval-log.md`);
process.exit(allOk ? 0 : 1);
