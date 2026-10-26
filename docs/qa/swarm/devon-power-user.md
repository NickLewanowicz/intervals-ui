# Devon — Coach Power-User · CHAT-STRESS round

**Persona:** AI-tools power user who breaks assistants for sport.
**Target:** QA stack only — web `127.0.0.1:8788`, mock coach API `:8099`, local PocketBase `:8090`. Production never touched (zero intervals.icu calls; the only approve path exercised was the QA mock).
**Account:** `qa-marathon@intervals.test` (marathon build data). Credentials are in the swarm brief, not repeated here.
**Driver:** `.scratch/swarm/devon/driver.mjs` (Playwright, headless 1280×800, dark via `colorScheme: 'dark'`) · structured evidence in `.scratch/swarm/devon/run-report.json` · follow-up probes in `.scratch/swarm/devon/probe-approve.mjs` / `probe-extras.mjs` · 20 captures in the shot registry under `qa-screenshots/registry/2026-10-26/92c936f/devon/` (surfaces `devon-*`).

---

## 0. Harness repairs required before anything was testable

Two environment problems consumed the first two runs. They are QA-harness issues, **not** app bugs, but they materially shaped this round:

1. **`tools/qa_mock_worker.mjs` never authenticated its PocketBase writes** (fixed during this round, QA harness only — no app/worker production code touched):
   - chat-session/message/proposal creates went out without the caller's bearer, but the schema (correctly, per `pb_setup.mjs`) makes those creates owner-scoped → every write 403'd. Consequences observed in-app: `done` carried **no `session_id`** (so no continuity was even possible), and the `proposal` SSE event shipped with **no id/payload/rationale**, rendering a nameless "Add to calendar" card and a review modal with zero fields.
   - apply/dismiss PATCHes went unauthenticated although `proposals.updateRule` is `null` (superuser-only by design) → Approve/Dismiss always failed.
   - the pending-proposals list swallowed the 403 and returned `[]` forever.
   - Fix: caller bearer on user-scoped creates/reads, superuser token for status PATCHes, plus a self-healing superuser token (re-auth after the stack gets reset under a running worker).
2. **The stack was reset twice mid-run by concurrent swarm agents** (`qa_stack.sh reset` wipes `pb_data` while other agents are driving it). Two runs produced garbage-in/garbage-out evidence (stale tokens, wiped transcripts) before the clean run below. Also: at least one other agent is writing chats to the **same qa-marathon persona account** ("How is my week looking?", "Schedule an easy 6k shakeout this Friday" appeared in my history) — cross-agent data pollution that makes persona-scoped evidence ambiguous.

**Registry evidence of the broken state (kept for the record):** the first-run captures show the payload-less modal — that state is unreachable on a healthy stack.

---

## 1. Transcript-by-transcript results (clean run, one session)

Wire-level truth was captured from the browser (POST `/api/chat` bodies + raw SSE frames) and cross-checked against PocketBase after the run.

| # | Turn | What fired | Verdict |
|---|------|------------|---------|
| a | "What does my week look like?" | No tools, no proposal. | PASS — read-only question stayed read-only |
| b | "Add a recovery jog on Friday." | `proposal` SSE frame with full `{id, kind, payload, rationale}` → modal auto-opens → **APPROVE** → `POST /api/proposals/:id/apply` 200 → card flips to **applied** | PASS at app level (see mock caveat) |
| c | "Also add one on Saturday but 10 minutes shorter." | Second, **identical** create proposal ("Easy mock run", Mon Nov 3, 5 km) → backdrop-closed, stays **pending** | App mechanics PASS; comprehension N/A (mock) |
| d | "What did I just ask you to change?" | No tools. Reply is unrelated canned text | App PASS (same `session_id` on wire, transcript persisted server-side); memory N/A (mock ignores history) |
| e | "Cut Friday's jog entirely." | Another **create_event** proposal (should be update/delete) → **DISMISS** → card flips to **dismissed** | App mechanics PASS; mock fidelity FAIL on kind |
| f | "Never mind, put Friday back the way it was." | No tools, no spurious writes, no crash | PASS — chaos check held |
| g | "Give me 3 tips for race week." | No-tool reply (text is the week summary — mock keyword collision) | PASS app-level |

Post-run PocketBase truth: 1 session (`yh7l9no98cknpao`, "What does my week look like?") holding all 7 turns; proposals exactly `applied` / `pending` / `dismissed`, each attributed to that session. Zero console errors across the whole run; the only failed request is the deliberate stop-abort.

Screenshot anchors: `devon-step-a-week`, `devon-step-b-modal` (rationale strip + When/Name/Category/Distance/Duration + timeline), `devon-step-b-approved`, `devon-step-c-modal`, `devon-step-d-context`, `devon-step-e-modal`, `devon-step-e-dismissed`, `devon-final-transcript`.

### What the mock can and cannot tell us (read this before quoting any verdict)

The QA mock brain is keyword-driven: `/add|schedule|cut|move|trim/` → always the same `create_event` ("Easy mock run", 2026-11-03); everything else → canned sentences; `/api/chat` ignores conversation history. So this round **proves the plumbing** — tool routing, proposal validation/persistence, review modal, approve/dismiss/status flips, card↔turn attribution, session threading — and **cannot prove** comprehension (step c's "10 minutes shorter"), memory (step d), or text↔card coherence (the prose around a proposal never matches the ask). Those need the budgeted real-LLM lane or a smarter mock.

---

## 2. Stress probes

### Stop button mid-stream — works, then leaks an internal error
Clicking **Stop** mid-stream interrupts immediately, keeps the partial ("Here's your"), restores the input, and swaps the button back. **But a red error row then appears: "BodyStreamBuffer was aborted" with a Retry button** (`devon-stop-midstream`). That's undici's internal abort message leaking through `send()`'s catch-all in `apps/expo/src/lib/api.ts` — the body-reader abort isn't recognized as an AbortError. Worse, **Retry re-sends the whole message**, so a user who stops and then reflexively clicks Retry double-sends. Reproduced on every stop on the worker path.

Fidelity note: the mock persists the **full** assistant reply after the client aborts (server keeps streaming), so a session revisit would show a longer reply than the user saw. The real worker persists the partial via `request.signal`; the mock should mirror that.

### Session isolation — real
"New chat" clears to the empty state, the next turn posts `session_id: null` and lands in a fresh session (`7bpa4mfo25nodtm` in PB), and the previous session survives intact in the Chats list (`devon-new-chat-empty`, `devon-new-chat-isolation`, `devon-chat-history`). The Chats screen renders TODAY grouping, titles, relative timestamps, search, per-row menus. One deliberate wrinkle: the **pending-proposals bar persists across New chat** — defensible (proposals are account-level, not chat-level) but it reads like leftover state.

### Rapid-fire turns — blocked by design
While streaming, the input is disabled with placeholder "Coach is thinking…" and Send is swapped for Stop (`editable={!sending}` in `coach/index.tsx`). You cannot compose or queue a follow-up during a reply. For a chatty power user this is the biggest flow friction: think-time is dead time.

### Approve / dismiss / close — three exits, all correct
Approve → applied; Dismiss → dismissed; backdrop press or Escape → closed-without-decision, proposal stays pending, and the pending bar ("N pending proposals to review — tap to open") reopens the full review sheet (`devon-pending-bar-review`). Card statuses update live after every resolution.

---

## 3. LIKED / CONFUSING / BROKEN / WISH

### LIKED
- **L1 · The steering loop is genuinely solid.** Proposal cards render inline under exactly the turn that produced them; the review modal leads with the coach's rationale, then full structured payload (When/Name/Category chip/Distance/Duration/Sport + workout timeline); Approve and Dismiss are one tap and both close + flip the card status. Every write I saw was gated behind an explicit approval — non-negotiable #1 holds under stress.
- **L2 · Three-way exit on the review sheet.** Escape and backdrop both close without deciding; the pending bar recovers them later with a count. No dead ends.
- **L3 · Session mechanics are trustworthy.** One session threaded across 7 turns (verified on the wire), New chat provably fresh, history preserved and browsable, stop-partial kept.
- **L4 · Tool discipline.** Six of nine turns were read-only or "soft" asks and not one fired a spurious proposal. The fail-safe default (no tool → no write) held everywhere.

### CONFUSING
- **C1 · Stop's error row (ties to B1).** After a deliberate stop you see a scary red error and a **Retry** that would re-send the stopped message. Users will read "stop failed."
- **C2 · Pending bar survives New chat.** Correct at the data level, but on a cleared transcript it reads like leftover chat state. A "review pending changes" affordance that isn't tied to the current chat deserves its own visual treatment.
- **C3 · Mock reply/keyword collisions.** "3 tips for race week" returns the week-summary text; every non-matching ask returns the same "Looking at your calendar…" sentence. Harmless in prod (real model), but it makes the QA transcript look broken to anyone who doesn't know the mock.

### BROKEN
- **B1 · (app, medium) Stop leaks "BodyStreamBuffer was aborted" + risky Retry.** Reproducible on the worker path. Fix: treat the post-abort body-read error as an intentional stop (silent, or a muted "Stopped" note), and drop/replace Retry in that state. Evidence: `devon-stop-midstream`.
- **B2 · (QA harness, high — fixed in this round) `qa_mock_worker.mjs` unauthenticated PB writes.** Made sessions, proposals, and approve/dismiss dead on arrival; masked by silent `?? []` error swallowing. Fixed (bearer on owner-scoped writes, superuser for status PATCHes, self-healing token). Should ride along with the swarm's QA tooling so no other persona hits it.
- **B3 · (environment, low) Shared-stack races.** Concurrent `qa_stack.sh reset` invalidates other live sessions (and, unfixed, the worker's cached tokens); multiple agents sharing one persona account pollutes per-persona evidence. Suggest per-agent persona accounts or a reset lock.

### WISH
- **W1 · Editable input during streaming.** Let users type (and ideally queue) the next message while the coach replies; stop-time is dead time right now.
- **W2 · A parameter-aware mock brain.** Parse day/duration ("Friday", "10 minutes shorter"), emit `update_event`/`delete_event` kinds for cut/move phrasing, and make `/api/chat` answer from the persisted session history. Without that, chat-stress rounds can only certify plumbing, never coaching.
- **W3 · A supervised real-LLM pass.** One budgeted lane for a single transcript (the infra already exists: `QA_REAL_LLM_KEY` + budget guard) so steps c/d can be judged on comprehension and memory, with text↔card coherence checked once by a human.
- **W4 · Stop UX copy.** A muted "Stopped — reply cut short" note (and no Retry) instead of an error row.

---

## 4. Core question: reliable coach, or demo?

**Reliable mechanics wearing a demo brain.** Everything that protects the athlete — proposals only via approval, correct kind/routing plumbing, no writes without an explicit Approve, clean session isolation, recoverable review queue — held under every stress turn I threw at it, with zero console errors. The one real UI defect (stop's internal error row + Retry double-send risk) is small but user-facing and should be fixed before shipping. Whether the *coach* is reliable — remembers, understands follow-ups, proposes what was actually asked — is unanswerable on the current mock; that's the gap between "the chat feels safe" and "the chat feels smart."

**Recommended follow-ups, in order:** fix B1 (app) · land B2's harness fix for all personas · W2/W3 before the next chat round · resolve B3's shared-account contention.

---

### Appendix — artifacts
- Driver + probes: `.scratch/swarm/devon/{driver,probe-approve,probe-extras}.mjs`
- Structured run evidence: `.scratch/swarm/devon/run-report.json`, `.scratch/swarm/devon/shots/extras-report.json`
- Registry: `node tools/shot_registry.mjs index --agent devon` (20 captures, surfaces `devon-*`, commit 92c936f)
- Harness fix under review: `tools/qa_mock_worker.mjs` (bearer on owner-scoped creates/reads; superuser for proposal status PATCHes; self-healing superuser token)
