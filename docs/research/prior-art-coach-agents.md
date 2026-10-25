# Prior art — open-source AI coach agents (agent + calendar + athlete data)

**Research date: 2026-10-24.** Method: GitHub search ("ai running coach", "strava ai coach",
"marathon training gpt", "intervals.icu AI coach", "training plan agent llm") + README/blog
fetches. Context for what we compare against: our coach is a Cloudflare Worker that builds
digests from PocketBase mirrors, calls OpenRouter with 3 calendar-write tools, and converts
every tool call into a user-approved proposal (docs/ARCHITECTURE.md §4).

## Comparison table

| Project | Stack | Where the agent sits | Calendar writes | Personalization / memory |
|---|---|---|---|---|
| [adamgordonbell/ai-running-coach](https://github.com/adamgordonbell/ai-running-coach) | Lambda + Strava webhook + Slack, GPT-4o | Serverless fn per run/daily trigger | none (advice only) | S3 markdown + `save_observation` tool |
| [philippe-ths/ai-running-coach](https://github.com/philippe-ths/ai-running-coach) (Pulse Coach AI) | FastAPI/Postgres/Redis, Next.js, Claude | Coach on top of deterministic analysis layer; SSE chat with read tools | actions as cards, confirmed | **split memory**: deterministic facts + LLM narrative; lexical retrieval |
| [rbrands/intervals-icu-sync](https://github.com/rbrands/intervals-icu-sync) | Python + FastMCP + scripts | MCP server; LLM (ChatGPT/Claude) is external | upload tool, validate-gated | system-prompt athlete profile block (per discipline) |
| [CrankAddict/section-11](https://github.com/CrankAddict/section-11) | Protocol + sync scripts (any LLM) | No agent — protocol + pre-computed JSON fed to any LLM | push.py script (agentic, optional) | `DOSSIER.md` stable-context file + JSON for current state |
| [yerzhansa/enduragent](https://github.com/yerzhansa/enduragent) | TS monorepo, Electron/Telegram/CLI, Vercel AI SDK, BYOK | Local coach app; deterministic plan skeleton before model call | intervals.icu writes only on request | plain markdown memory files + local SQLite |
| [shiv19/endurance-coach-skill](https://github.com/shiv19/endurance-coach-skill) | Claude/agent "skill" (SKILL.md + templates) | Skill executed by any agent runtime | none (exports .ics/.fit/.zwo) | intake interview + Strava history analysis |
| [AgentsRoomDev/running-performance-coach](https://github.com/AgentsRoomDev/running-performance-coach) (+ [blog](https://agentsroom.dev/blog/build-your-own-ai-running-coach)) | Git repo as memory + Claude Code agent | Agent reads/writes the repo; Strava data auto-committed | plan.md edits (git = audit log) | journal session sheets + athlete/ profile files |
| [oleksandr-g-rock/ai-runner-coach](https://github.com/oleksandr-g-rock/ai-runner-coach) (ActiveBuddy) | Python/aiohttp + Postgres JSONB + OpenRouter (Llama 3.3) | Telegram webhook → tool-calling agent | none | `save_profile_info` tool → Postgres |

Also surveyed, not profiled: [voynow/crushyourrace](https://github.com/voynow/crushyourrace)
(App Store coach, event-driven replanning via an "eventbridge", closed core — thin detail),
[leonzzz435/garmin-ai-coach](https://github.com/leonzzz435/garmin-ai-coach) (Garmin insights,
thin), [tjyana/marathon-planner](https://github.com/tjyana/marathon-planner) (plan generator,
not an agent). Academic evidence: [arXiv 2509.26593](https://arxiv.org/html/2509.26593v1)
(single-subject ChatGPT half-marathon prep) — profiled at the end because it documents the
failure modes of *no* memory architecture.

---

## 1. adamgordonbell/ai-running-coach — the memory-tool loop, distilled

Demo code from the talk "I Built an AI Running Coach" (simplified from the author's production
coach "Momentum"). Two triggers — a 6am EventBridge cron and a Strava post-run webhook — feed
one Lambda that pulls recent runs from DynamoDB, loads **three markdown files** (coach voice,
training plan, athlete context from S3), calls GPT-4o with **exactly one tool:
`save_observation(text)`** — and if the tool fires, appends the observation to S3 so "every
future prompt" includes it. "That S3 append is the entire memory mechanism."

The README is candid about what the demo collapses: production runs
**chat → DynamoDB journals → weekly summarizer → S3** — i.e., raw conversation is compacted by
a *second, scheduled* LLM pass before it becomes durable context. Production also computes
CTL/ATL, availability, and durability from Strava HR streams rather than trusting the model.

- **Good:** smallest possible memory design (one tool, one file); extraction separated from
  conversation; honest about deterministic-metrics-first.
- **Bad:** push-only (Slack), no calendar integration, no user approval surface, single athlete.
- **Steal:** the observation→durable-context loop; the *weekly summarizer* between raw chat and
  memory; the daily proactive touchpoint (their 6am cron — we already have a 6h Worker cron).

## 2. philippe-ths/ai-running-coach (Pulse Coach AI) — the most architecturally mature

MIT, multi-user, live product. Pipeline per activity: **ingest → analyze → assign block →
generate coach exchange → notify**, where analysis is deterministic (effort, HR drift,
time-in-zones, risk flags) and the LLM only narrates and coaches on top — "a correct, auditable
deterministic substrate … never letting personality override the measured data or a safety
floor." Coach chat is SSE with read-tools over the athlete's own Postgres rows, and writes are
offered as **cards the user confirms** — the same shape as our proposals.

Memory is the standout, documented in their ADRs: a **durable split memory** — (1) auditable
deterministic facts and (2) an LLM-written "relationship narrative" — plus a learning loop that
tracks which advice the athlete actually acted on. Retrieval is **lexical, not vector** (ADR
0014: keyed lexical retrieval over a code-resident library). Uploaded coaching docs are
"distilled on ingestion and made inert by containment … a document cannot steer the coach"
(ADR 0017). A **deterministic policy validator gates every coach message, including streamed
output** (ADR 0024) for medical scope and zone language, and prompt changes ship only through
an offline eval harness scored against a versioned rubric. Per-user LLM spend caps with a
deterministic fallback at the ceiling.

- **Good:** proves the split memory + lexical retrieval design at multi-user scale; policy
  validator is the right answer to "LLM says something unsafe mid-stream."
- **Bad:** heavy stack (Redis/RQ/Clerk/Next.js) for what we do; narrative memory is hard to
  audit without their tooling.
- **Steal:** split memory (facts vs. narrative); lexical-not-vector as an explicit, documented
  decision; spend caps before multi-user.

## 3. rbrands/intervals-icu-sync — the intervals.icu MCP reference

Python + FastMCP server wrapping intervals.icu (hosted + self-host), with Joe Friel-based
`coach-logic/` docs and per-discipline system-prompt profile blocks (marathon, climber, …).
Tools: `prepare_week_data` (one consolidated weekly JSON: metrics, readiness traffic light,
planned workouts), `check_athlete_data` (deterministic 7-area data-quality audit — "makes no
API calls, stores nothing, gives no training recommendations"), `get_latest_activities`
(9-field compact list "for clients that truncate large outputs"), sampled stream access, and
`save/validate/upload_week_plan` where **upload is gated by a separate deterministic validator**
and upserts are duplicate-safe.

- **Good:** the consolidate-into-one-digest pattern matches ours and validates it; the
  validate/upload split proves our validateProposal + apply split; data-quality auditing is a
  neat, honest tool.
- **Bad:** manual loop (copy JSON into ChatGPT, paste plan back) — no conversation, no
  steering, no memory.
- **Steal:** the discipline profile blocks (ready-made athlete-profile scaffolding); the
  readiness traffic light as a pre-computed field in the digest.

## 4. CrankAddict/section-11 — deterministic coaching as a protocol

Not an app: an MIT "open protocol for deterministic, auditable AI-powered endurance coaching"
run on any LLM, with intervals.icu as the recommended data source. A sync script **pre-computes
the metrics** (ACWR, Recovery Index, Monotony/Strain, Seiler TID, durability) into JSON so
"AI doesn't need to compute them," and markdown protocols (11A/11B/11C) carry behavioral rules,
volume-ceiling and 80/20 checks, and a structured audit checklist. Stable athlete context —
"background, equipment, stable constraints, health and injury history, tested fueling, and how
you prefer to be coached" — lives in a private `DOSSIER_TEMPLATE.md`, while "current thresholds
and load always come from your JSON." Rule-based triggers ("HRV ↓ >20% → consider easy day /
deload", ACWR 0.8–1.3 green-light) are tables, not model judgment.

- **Good:** the dossier/json split is exactly static-profile vs. live-digest — and it names the
  dossier fields we should suggest in our profile placeholder. Trigger tables are evaluable.
- **Bad:** no conversation, no memory beyond the hand-edited dossier, cycling-first framing.
- **Steal:** dossier field list; the trigger tables (ours live in prose in the coach prompt —
  computing them in the digest would make them enforced instead of emulated).

## 5. yerzhansa/enduragent — closest overall to our architecture

MIT, self-hosted TS monorepo; three front ends (Electron, self-hosted Telegram bot, CLI) share
one coach. Reads profile/FTP/zones/activities/wellness from intervals.icu via the user's API
key (falls back to parsing .fit/.tcx/.gpx on device), computes zones and plan skeletons
**locally "with no model call"** (feasibility checks on FTP/W/kg targets, five periodization
styles), and "nothing is written to your calendar unless you ask." BYOK across nine providers
including OpenRouter, with a local spend meter and daily cap. Personalization: "It remembers
you: goals, injuries, equipment, schedule — **plain files, yours to open or delete**" —
markdown memory + local SQLite under `~/.enduragent`. Ports section-11 as its data substrate.

- **Good:** answers "from your numbers, not from a questionnaire"; deterministic pre-checks
  before the model plans; memory transparency as a feature.
- **Bad:** local-only (no shared data plane, no mirror); memory is files the user curates by
  hand — no automatic accumulation.
- **Steal:** show the user what the coach remembers and let them delete it (we can do this as a
  Settings card over `coach_memory`); compute plan feasibility *before* the LLM touch.

## 6. shiv19/endurance-coach-skill — contract-first plan generation

An agent-agnostic Skill (MIT) for building endurance plans. Two ideas matter: **contract-first
output** — machine-consumable schemas with structured validation errors so "agents can
validate output and get structured error feedback" and self-correct — and **template-based
composition**: the agent "selects from a predefined, inspectable set of workout building
blocks," authoring plans as concise YAML, instead of freely inventing verbose JSON. Personal
context (event date, history, injuries, travel constraints, pool/trainer access) comes from an
intake interview plus optional Strava analysis.

- **Good:** directly attacks the failure mode our prompt spends 200 words on (the
  free-text workout `description` grammar — the eval log shows drift on section/repeat counts).
- **Bad:** one-shot plan generator, no ongoing coach relationship, no memory.
- **Steal:** a small library of canonical workout blocks (section-line-carries-count patterns)
  the coach composes, rather than asking the model to improvise intervals.icu syntax every time.

## 7. AgentsRoomDev/running-performance-coach — the git repo as coach memory

Blog + template: a Claude Code agent whose memory *is* the repo. After every synced run it
appends a structured **session sheet** (Objective · Execution · Injuries/notes · "What this
session says" — one interpretive line) and reads **the last three sheets** before judging any
session: "Session N is never judged alone. Read last 3 … it is only meaningful as trend." The
plan (`plan.md`) is reviewed **weekly, not per session** ("don't analyze every day — that is
what injuries are made of"), stable traits live in `athlete/constraints.md` and
`athlete/profile.md`, and "the whole history is in git history" — every coaching decision is
diffable. The author's key claim: the agent "doesn't remember in a mystical memory bank — it
reads the log you made it write."

- **Good:** the sheet schema is a ready-made `kind=outcome` memory template; the
  read-last-3-before-judging rule is a concrete history-injection policy; weekly (not daily)
  plan revision cadence.
- **Bad:** single-user, no approval surface (agent edits the plan directly), depends on Claude
  Code as runtime.
- **Steal:** outcome-sheet fields; "never judge one session alone" as an explicit prompt rule;
  the weekly block-review touchpoint.

## 8. arXiv 2509.26593 — the no-memory control group

Two-month n=1 auto-ethnography: ChatGPT as half-marathon coach, manual log uploads, **no
persistent memory, no sensing**. Planner and explainer roles worked well; the paper's
conclusions read like our roadmap: (1) "no persistent athlete model … guardrails were emulated
conversationally rather than enforced systematically"; (2) the **motivator role failed** —
support was user-initiated, "help least available when most needed" (during bad weeks the chat
was never opened); (3) it proposes exactly the persistent-athlete-model + explicit-safety-logic
architecture we already half-have. Useful as evidence for: enforced (computed) flags >
prose rules, and a proactive scheduled touchpoint has real value.

---

## What we should adopt

1. **Structured memory rows + post-turn extraction** (adamgordonbell's observation loop +
   philippe-ths's fact/narrative split, PocketBase-native). Store auditable per-fact rows, not
   a narrative blob; render the digest deterministically at prompt-build time. Full design in
   `docs/research/coach-memory-design.md`.
2. **Compute the risk flags in the digest, don't prose them** (section-11 + the arXiv "emulated
   conversationally rather than enforced" finding). A `flags:` line in the wellness/calendar
   digest (form ≤ −30, HRV multi-day slide, >30% ramp, monotony, race-without-taper) is
   testable and model-agnostic; the prompt then just says "address flags."
3. **Canonical workout blocks** (shiv19) to harden the description grammar: a short library of
   section-line-carries-count templates in the prompt (or a `describe_workout` helper in core)
   instead of trusting improvisation — the eval log already caught drift here.
4. **Memory transparency UI** (enduragent): a Settings card listing what the coach remembers
   (active `coach_memory` rows) with per-row deactivate. BYO-key users will ask "what do you
   know about me?" — the answer must be inspectable, especially since our collection is
   superuser-write (LOCKED) like the mirrors.
5. **A proactive touchpoint on the existing cron** (adamgordonbell's 6am check-in, arXiv's
   motivator gap): the 6h Worker cron already runs per-user; a daily "coach note" (digest →
   short message stored like chat) would fix the biggest documented failure of reactive-only
   coaches. Cheap follow-on, not v1.
6. **Per-user spend caps before multi-user** (philippe-ths): daily/monthly token ceiling per
   user with graceful degradation — BYO keys cap *our* exposure but not the user's own bill.
7. **Weekly block-review cadence** (AgentsRoom): frame multi-week plan adjustments as a
   weekly review the coach initiates, not per-session churn — pairs with #5.

Not adopted, deliberately: MCP-server architecture (we already have a purpose-built tool plane
with validation and approvals — MCP adds an external client without adding control); vector
memory (see memory-design doc); "adaptive replan on every activity" event-driven loops
(crushyourrace) — our user steers every write, and the 21-day calendar digest already carries
done-vs-planned outcomes into every turn.
