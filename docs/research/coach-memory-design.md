# Coach memory design — accumulating athlete knowledge across sessions

**Research date: 2026-10-24.** Goal: the coach should get to know the athlete over time —
goals, preferences ("train me faster than goal time"), recurring constraints (injury protocols,
physio notes), session outcomes — beyond the static `athlete_profile` textarea in Settings.
Prior art survey in `docs/research/prior-art-coach-agents.md`.

## 0. Real constraints (from docs/ARCHITECTURE.md + the code)

- **Data plane = PocketBase on pockethost.** Rate-limited `/api` (429s), batch API disabled,
  sequential writes with retry/backoff. Schema of record is `tools/pb_setup.mjs`; app-facing
  collections are owner-read + LOCKED (writes only as superuser from the Worker).
- **Coach = Cloudflare Worker**, 50-subrequest cap per request. Current chat turn: ~9 PB calls
  (auth, 4 digest queries, history, 2 message writes) + 1 OpenRouter call + N proposal writes —
  headroom for ~1 more LLM call and a few writes, not for a retrieval pipeline.
- **BYO OpenRouter key.** Every token is on the user's bill; flash-class roster
  (`glm-5.3-flash` default, reasoning `low`). No server-side key of our own to "just run a
  background job with a big model."
- **Single user today, multi-user later.** Everything is keyed `rel user`; nothing may assume
  one global memory store.
- **Steered writes doctrine** applies to intervals.icu only; the coach's own notebook is
  internal state and may be written by the Worker without a proposal modal (like chat_messages).
- **Prompt changes are owned by coach-tuner**: any prompt edit bumps `COACH_PROMPT_VERSION` and
  ships only with eval numbers (`tools/eval_prompts.mjs`, `.scratch/evals/fixtures/`,
  `docs/research/eval-log.md`).
- **Current state:** `HISTORY_MESSAGES = 20` from the *current session only* (the `chat()`
  handler in `apps/worker/src/index.ts` filters `session="…"`); no cross-session context;
  `athlete_profile` (4,000-char textarea on `users`) is the only durable personalization.

## 1. Option A — structured `coach_memory` collection (RECOMMENDED BASELINE)

### 1.1 The collection (add to `tools/pb_setup.mjs`)

```js
await upsertCollection({
  name: 'coach_memory',
  type: 'base',
  fields: [
    rel('user', USERS_ID),
    rel('session', chatSessions.id, { required: false, cascade: false }), // provenance
    select('kind', ['preference', 'goal', 'injury', 'constraint', 'outcome', 'note']),
    text('key', 80),      // stable slug, e.g. "pref-overprepared", "injury-calf-left"
    text('content', 500), // one fact, coach-readable sentence
    bool('active'),       // inactive = superseded/expired, kept for audit
  ],
  indexes: [
    'CREATE UNIQUE INDEX idx_mem_user_key ON coach_memory (user, key)',
    'CREATE INDEX idx_mem_user_active ON coach_memory (user, active, updated)',
  ],
  ...OWNER_READ,
  ...LOCKED,   // superuser writes from the worker; matches mirrors/workflow doctrine
});
```

Why `key`: it turns re-extraction of the same fact into an **upsert** instead of a duplicate —
"goal changed to a 3:15 BQ" updates `goal-fall-marathon` rather than appending a second row.
Why `active` instead of delete: injuries heal and goals complete; keeping the row preserves
history and lets the Settings UI show "past memories" later. Holder doctrine: like chat, this
is **not rebuildable** from intervals.icu — add a row to the §2 table ("lost on wipe;
acceptable, athlete-visible in Settings") and include it in any future export.

### 1.2 Who writes it — three variants, honestly

**(a) Automatic post-turn extraction.** After the assistant message is persisted, the Worker
fires a second, cheap LLM call: "here are the last few messages + the current memory list;
return durable facts as JSON." Run it via `ctx.waitUntil()` after the `done` SSE event so it
**never adds user-visible latency**.

- Cost: ~1.5–3k input tokens (rules + current memories + last ~6 messages) and ~50–250 output
  tokens per chat turn. On the roster flash models that is roughly $0.0005–0.002/turn on the
  user's key — a rounding error next to the main call (~40–50k input per the eval log).
- Subrequest cost: +1 OpenRouter, +1 read (existing memories, already fetched for the prompt —
  reuse it), +0–3 writes. Comfortably inside the 50-cap.
- Risks: junk rows, duplicates, over-extraction of trivia. Mitigated by the key-upsert, a
  confidence/durability rule in the prompt, and caps. Silent failure is acceptable — memory is
  additive; a skipped extraction loses nothing structural.

**(b) A `remember` tool the coach calls in-conversation.** Fits our existing pipeline exactly
(tool_calls are parsed *after* the stream ends and handled Worker-side — no result round-trip
needed; a `remember` handler just writes `coach_memory` directly, no proposal). It captures
explicit intent perfectly ("remember that I hate treadmills").

- But: models notoriously **under-call** memory tools when nothing reminds them, our current
  prompt would need a new section + eval fixtures for a fourth tool, and the user should not
  have to remember to say "remember this" for the coach to learn. Explicit asks are the
  minority of durable facts; "I'm seeing a physio Tuesdays now" usually appears as an aside.

**(c) Both.** The honest verdict: extraction (a) is the 90% case and must ship first; the tool
(b) is a cheap add-on *afterwards* using the same `upsertMemory()` helper and validation — it
exists mostly for explicit "forget that / actually it's 3:15 now" corrections, and its call
rate is a measurable eval question, not an assumption.

**Recommendation: (a) now, (b) later** — same helper, same collection; ship the tool only if
evals show explicit memory asks being missed by extraction.

### 1.3 Extraction prompt sketch (Worker-side, separate from the coach persona)

```
System: You maintain a coach's memory about one athlete. From the conversation turn, extract
only DURABLE facts a coach must know in future sessions:
- preference: how they like to be coached/train ("over-prepared — train me faster than goal time")
- goal: races, goal times, target events
- injury: pain, physio protocols, movement restrictions
- constraint: schedule, travel, equipment, family
- outcome: NON-derivable session results (bailed due to calf tightness; long runs feel easy).
  NEVER store what the calendar/wellness data already shows (paces, loads, HRV numbers).
- note: anything else durable
Rules: skip small talk, jokes, and anything already in the known-memories list (update it
instead via the same key). content ≤ 200 chars, one fact each. You may deactivate memories the
athlete says are no longer true. Return ONLY JSON:
{"memories":[{"action":"upsert"|"deactivate","key":"kebab-case-slug","kind":"preference|goal|injury|constraint|outcome|note","content":"..."}]}
Return {"memories":[]} when nothing durable was said.

User: Today {date}. Athlete: {name}.
Current memories: {json list of active {key,kind,content}}
Profile (user-authored, authoritative): {athlete_profile}
Recent messages: {last 6 messages of the turn, role-prefixed}
```

Worker handling: tolerant JSON parse (strip fences; skip turn on failure), validate `kind`
enum / `key` slug `^[a-z0-9-]{3,80}$` / content ≤ 500, then `upsertMemory`: match on
`(user, key)` → update content/session/updated (reactivate if needed) or insert. Cap total
active rows per user at ~80 (skip writes beyond; the digest renderer also caps). Use the same
resolved model as the chat turn with reasoning `low`; do NOT add a fourth roster entry for
extraction in v1.

## 2. Rolling session summary vs per-fact rows

A rolling digest (one text blob per user, rewritten each session) is tempting: 1 row, no
extraction JSON, always current. Rejected as source of truth because it is **lossy and
unauditable** — a stale "left calf sore" inside a 2,000-char blob survives forever, the user
cannot see or correct individual facts, and summary-of-summary drift compounds (philippe-ths
keeps their LLM narrative quarantined behind deterministic facts for exactly this reason).
Per-fact rows with the `key` upsert give: dedupe, individual deactivate, a future "what do you
know about me?" Settings card, and deterministic rendering.

**Recommendation: per-fact rows are the store; the "rolling summary" exists only as a
deterministic RENDERING of active rows** built at prompt time (§4). If row counts ever exceed
~100/user, add ONE `note` row refreshed monthly by a summarizer over inactive+active rows
(adamgordonbell's weekly-summarizer pattern) — not before.

## 3. Vector search / embeddings — no (be opinionated)

The owner asked; the answer is **not yet, and probably never for this workload**:

- **Scale:** a single-athlete coach accumulates *tens* of facts, not thousands. Injecting all
  active facts costs <1.5k tokens — far cheaper and **higher recall** than any retrieval.
  Embeddings at this size only *lose* information: an injury note phrased unusually can miss
  semantically; brute-force injection cannot.
- **Infra:** PocketBase has no vector search; Cloudflare Vectorize means a new index + binding
  + an embeddings model call (BYO key again) + a dual-write/sync path + a rebuild story under
  the holder doctrine — plus Workers Paid ($5/mo floor) for production usage. All to replace a
  `WHERE user=… AND active=1` query over ≤80 rows.
- **Retrieval ranking:** when caps do bite (long horizon), order by
  `kind priority (preference, goal, injury, constraint > outcome, note)` then `updated DESC`
  and hard-cap the digest (~1.5k tokens, ~40 rows). Keyword matching (`~` contains filters in
  PB) is available for any future "asked about the calf → pull injury rows" nudge.

**Revisit trigger (write it down):** multi-user shipped AND p95 active facts/user > ~100 AND
injection cap demonstrably dropping relevant facts in evals. Until all three: keyword +
recency + kind wins. (Pulse Coach AI reached the same conclusion at real multi-user scale —
ADR 0014, lexical over vector.)

## 4. Conversation history — window + facts, not transcripts

Current: last 20 messages, current session only. Keep the window (bump to a named constant 24
if desired — do not grow it much; older turns are noise and tokens are the user's money), and
add two cheap continuity layers:

1. **Memory digest** (this doc's core): facts outlive sessions, so "what we discussed in
   October" is answered by `coach_memory`, not by replaying transcripts.
2. **Session recap line (v1.5):** `chat_sessions` already has `title` (first 60 chars of the
   first message). Inject the previous session's title + date as one line ("Last time
   (Oct 21) you asked about …"). If that proves too thin in practice, add a
   `summary` text field on `chat_sessions` filled by the *same extraction call* when it runs —
   but do **not** summarize older sessions into standalone memory rows wholesale; only durable
   facts belong in `coach_memory`. Do not build a summarizer job for old transcripts.

## 5. Recommended architecture (concrete)

### 5.1 Prompt injection (edit to `buildCoachSystemPrompt`, CoachContext + `memoryDigest`)

Rendered by the Worker from active rows — `preference, goal, injury, constraint` first, then
`outcome, note`; newest-`updated` first within kind; cap ~40 rows:

```
### What you remember about this athlete
(durable facts from past conversations — newest first; if the athlete contradicts one, adopt
the correction and it will be updated)
- [goal] Fall marathon 2026-11-08, target sub-3:30 (updated 10-20)
- [preference] Wants to be over-prepared: prescribe slightly faster than goal pace (10-20)
- [injury] Left calf strain: no back-to-back quality days; physio Tue (since 09-14)
```

Insert between "Training zones" and "Athlete profile" (profile stays — user-authored beats
extracted; the extraction prompt sees the profile to avoid duplicate rows). Bump
`COACH_PROMPT_VERSION` 2→3.

### 5.2 Worker flow (`apps/worker/src/index.ts`)

```
chat():
  memories = listRecords('coach_memory', user, 'active=true', sort -updated, perPage 80)  // +1 PB call
  system = buildCoachSystemPrompt({ ..., memoryDigest: renderMemoryDigest(memories) })
  ... existing stream, proposals, assistant-message persist ...
  ctx.waitUntil(extractMemories(env, user, sessionId, lastTurnMessages, memories, profile))
```

`extractMemories` must receive `ctx` (currently `chat()` doesn't take it — thread it from the
fetch handler). Inside: one OpenRouter call (same key/model, reasoning low, ~1,200 max
completion tokens), validate + `upsertMemory()` (0–3 sequential PB writes with the existing
backoff), **all failures swallowed** (console only) — never break a chat turn that already
succeeded. `waitUntil` budget (~30s post-response) is ample.

### 5.3 Later iterations (in order)

1. `POST /api/memory/:id/deactivate` (Worker, superuser) + Settings card listing active
   memories (enduragent's transparency).
2. `remember` tool (validate kind/key/content; direct write; prompt rule: "call it when the
   athlete explicitly asks you to remember or correct something").
3. Previous-session recap line (§4.2).
4. Monthly compaction row if active rows > ~100 (§2).

## 6. Build order

1. `tools/pb_setup.mjs`: add `coach_memory` (+ holder-doctrine note) → re-run (idempotent).
2. Worker: fetch memories + `renderMemoryDigest()` + `memoryDigest` in `CoachContext` and the
   prompt template. **Prompt change → coach-tuner owns it** (see §7).
3. Worker: `extractMemories()` in `ctx.waitUntil` + `upsertMemory()` helper + validation caps.
4. Eval fixtures (§7) + real confirmation run on the default model; log to eval-log.md.
5. Settings card (read list, deactivate) + `/api/memory/:id/deactivate`.
6. Optional: `remember` tool, session recap, spend-guard on extraction (skip when the turn's
   usage already exceeded a token budget).

## 7. Eval gates BEFORE shipping (fixtures the harness can express)

Prompt side (`.scratch/evals/fixtures/`, replayed by `tools/eval_prompts.mjs` — **coach-tuner
must run the existing 7 fixtures green on v3 first**, then add):

- `memory-respected.json`: prompt includes an active `[injury] no back-to-back quality days`
  row; user asks for a hard week → expect proposals that never stack quality days
  (+ `mustMention` the constraint).
- `memory-no-regress.json`: empty memory digest renders `(no memories yet)` and all existing
  fixtures still pass byte-identical behavior (guards the new prompt section against
  regressions — the v2→v3 diff is otherwise a no-op for them).

Extraction side (new offline harness, no network — proxy-eval pattern from eval-log 2026-10-24
works: golden turns → expected JSON, scored exactly):

- preference stated mid-chat ("I like to be over-prepared — train me faster than my goal time")
  → exactly one `upsert`, kind `preference`.
- contradiction ("goal is now 3:15 BQ") → `upsert` on the existing goal `key`, not a new row.
- deactivation ("the calf is fine now, no more physio") → `deactivate` on the injury key.
- ephemeral ("ugh, rain again today") → `{"memories":[]}`.
- derivable outcome (a completed run already visible in the calendar digest) → no `outcome`
  row (the rule most likely to fail — weight it heavily).

Nothing here re-opens the proposal validators; the only contract change is additive (new
collection, new prompt section, new background call). Ship order above keeps each step
individually revertible.
