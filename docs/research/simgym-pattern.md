# The SimGym pattern — synthetic user agents that shop, gripe, and get synthesized

2026-10-26 · Research for a sim-persona swarm against our app. Method: primary
sources read live (Shopify engineering post, the SimGym paper, help docs,
third-party reviews; WebFetch 2026-10-26), plus adjacent academic/commercial
work. Question: what did Shopify actually build, what's the generalizable
pattern, and what would our version look like for the Expo coach app?

## TL;DR

Shopify's SimGym sends hundreds of LLM browser agents — each with a persona,
budget, and shopping intent grounded in the merchant's *real* clickstream —
through the actual storefront in isolated cloud browsers. The agents behave
(what they do) *and* narrate (per-shopper friction notes); a summary step folds
individual traces into strengths / weaknesses / **prioritized recommendations**.
Predictive validity is real but bounded: ~69% directional alignment with human
add-to-cart outcomes, correlation ~0.65 at 300+ agents — good enough as a cheap
*first screen*, explicitly not good enough as proof. The pattern ports cleanly
to us; the two things Shopify spent the most effort on (grounded personas,
per-step memory) are exactly the two things that fail when skipped.

---

## 1. What SimGym is (public record)

**The product.** SimGym is a first-party Shopify app, launched ~Dec 2025 as an
"AI Research Preview" (Winter '26 Edition). It sends AI-powered shoppers with
"human-like personas" through a merchant's Liquid storefront to simulate buyer
behavior: single-theme review, active-vs-draft theme comparison, or focused
areas (homepage, product page, collections, cart, search). Merchants get a
comparison verdict based on simulated add-to-cart (A2C) rate, **individual
shopper traces** (action logs, session recordings, qualitative feedback —
"they report where they got stuck"), and a summary of strengths, weaknesses,
and **prioritized conversion recommendations**. Free to install, pay-per-credit.
([Shopify Help Center](https://help.shopify.com/en/manual/online-store/simgym),
[The Rundown](https://www.therundown.ai/tools/shopify-simgym),
[Contra Collective](https://contracollective.com/blog/shopify-simgym-ai-shopper-simulation-2026),
[Shopify blog](https://www.shopify.com/blog/ai-agents-retail))

**The engineering.** ["2000 robots walk into a shop"](https://shopify.engineering/simgym)
(Shopify Engineering, Feb 2026, a Shopify + NVIDIA collab): each agent has "a
persona, a budget, and a shopping intent"; each runs in a real cloud browser
(Browserbase, up to 2,000 concurrent Chromium sessions) against the **real
rendered storefront** — "no mocked DOM, no shortcuts." The LLM gets a one-line
system prompt + buyer profile + accumulated session memory + a page
representation of 3–15K tokens per step (accessibility-tree style, not raw
HTML), and emits schema-constrained JSON actions. 10–13 steps per session,
~90–127K tokens per session, ~400K sessions/day. Inference is self-hosted
gpt-oss-120b on 48 B200s — they abandoned GPT-4o APIs because "per-token API
costs were not sustainable" at that scale, and session time dropped 15+ min →
under 3. Merchant-run cost: "single digits and falling."

**The paper.** [SimGym: Traffic-Grounded Browser Agents for Offline A/B
Testing](https://arxiv.org/abs/2602.01443) (Castelo et al., Shopify, Feb 2026)
is the most useful public document. Key findings:

- **Personas are distilled from real traffic, not invented.** Six-stage
  pipeline per shop: k-means session clustering (k=5) → LLM product-preference
  extraction → purchase/browse intent mix calibrated to the cluster's real A2C
  rate (strict two-sentence intent template, bundles/discounts/UI opinions
  *forbidden*) → behavior aggregation → a 5-dimension persona (price
  sensitivity, exploration depth; premium/performance/ethics inferred from
  *revealed* preference — browsed-vs-bought keyword shares) → 1:1
  intent-to-persona prompt composition.
- **Perception = accessibility tree**, not screenshots or HTML. Token-cheap
  and theme-agnostic. Guardrails: infinite-loop detection, step/time limits,
  model retry, full episodic session memory replayed every step (no RAG).
- **Validation against 20 real shops' actual theme changes**: with 600 agents
  per shop, directional alignment with human A2C movement = 69%, Pearson
  correlation ≈ 0.65 (stable from ~300 agents; alignment plateaus ~500).
- **Ablations are the story** (see §2 failure modes): drop session memory →
  correlation falls 0.64 → 0.29 and 46% of sessions get stuck in loops; drop
  personas (intent-only prompts) → alignment 52%, i.e. chance; use *generic*
  donor personas instead of shop-grounded ones → alignment holds (62%) but
  magnitude collapses (slope 0.18) and "product not found" errors spike from
  distribution mismatch.

**Honest caveat on the "PM synthesis" step.** The engineering post describes
only behavioral output (A2C rates); the qualitative-likes/dislikes +
prioritized-recommendations layer is documented in the product surfaces above
and in third-party reviews, but **no public source describes a separate PM or
SME agent doing synthesis** — the pattern the user described (personas →
disparate feedback → PM consolidates into actionable improvements) is the
reasonable reconstruction of how those prioritized recommendations get made,
and matches adjacent practice (§2). Treat the synthesis role as inferred, not
cited.

**Reception.** HN threads were near-ignored (3 points, 0 comments —
[Algolia](https://hn.algolia.com/api/v1/search?query=Shopify%20SimGym&tags=story)).
App-store review criticism is the sharpest public signal: "an interesting idea
and fun to test, but in its current form, the results are too unreliable to
serve as a basis for decision-making"
([reviews](https://apps.shopify.com/simgym/reviews)).
[Contra Collective's review](https://contracollective.com/blog/shopify-simgym-ai-shopper-simulation-2026)
is the best critical read: value = "speed and cheapness" as "the first,
cheapest round of usability review"; failure mode = "treating a favorable
SimGym result as proof, then skipping the real validation." It also notes the
structural blind spot: headless storefronts are invisible to it (themes only).

**Adjacent lineage.** AgentA/B (Stanford, [arXiv:2504.09723](https://arxiv.org/abs/2504.09723)):
1,000 LLM agents on a live e-commerce site could detect UI/UX differences
between A/B conditions. Generative Agents ([arXiv:2304.03442](https://arxiv.org/abs/2304.03442))
established persona + memory architecture. Commercially, the same pattern
drives synthetic-user-research startups (SyntheticUsers, Societies.io YC W25
[HN launch](https://news.ycombinator.com), focusgroups-ai) — "test messaging on
a simulated audience" — with loud practitioner skepticism from UX researchers
(e.g. [r/UXResearch](https://www.reddit.com/r/UXResearch/comments/1ptitut/)):
synthetic feedback is fine for idea generation and usability smells, worthless
as a substitute for real users. That split — exploration cheap, verification
real — is the consensus position and ours too.

## 2. The generalizable pattern

```
real usage data ──► persona spec ──► isolated environment ──► autonomous
                    (grounded,        (real surfaces, no       exploration
                     calibrated)       prod writes)             (steps, memory,
                                                                guardrails)
                                                                  │
prioritized actions ◄── synthesis role ◄── structured feedback ◄──┘
                      (one agent,        (per-agent traces +
                       clusters +          narration)
                       ranks + cites)
```

1. **Persona specification** — identity (who), goal (what they're trying to
   accomplish), behavior calibration (how they act: patience, exploration
   depth, price/approval sensitivity), seeded from *real* data where possible.
   SimGym's intent prompts are deliberately terse and grounded; personality
   flourishes in prompts correlated with worse realism (they forbid opinions
   about UI in intents — the *behavior* should surface friction, not a script).
2. **Environment isolation** — the agents hit the real app/surface (no mocked
   DOM — mocks hide the bugs), but in a sandbox with no production writes:
   preview themes for Shopify; for us, a local backend. Production stays
   read-only or untouched.
3. **Autonomous exploration** — perceive (accessibility tree/DOM, not
   screenshots) → plan → act → remember. Full session memory every step;
   loop detection; hard step and time caps. Structured JSON actions so runs
   are inspectable and replayable.
4. **Structured feedback capture** — per-agent: the action trace (what they
   did, where they got stuck, retries, abandonments) *plus* first-person
   narration (confusion, likes, dislikes, improvement ideas). Both matter:
   the trace catches what the agent can't articulate; the narration catches
   what the trace can't explain.
5. **Synthesis role** — a separate step (PM/SME) reads all traces + notes,
   clusters duplicates into themes, discards one-off noise, and emits ranked,
   evidence-cited recommendations. This is cheap and centralizing; never let
   individual personas vote on priorities.
6. **Prioritized actions** — output is a *candidate* list for humans, with
   directional-confidence language. Shopify pairs SimGym with a real A/B
   product (Rollouts) for confirmation; the sim is the screen, not the verdict.

**What made it work** (ranked by the paper's own ablations): (a) full
per-step session memory; (b) personas grounded in real behavioral data
(chance-level results without them); (c) accessibility-tree perception
(token cost made 400K sessions/day feasible); (d) strict structured outputs;
(e) owning inference/cost (cheapest-capable model, not the flashiest).

**Failure modes reported:** memory loss → loops and timeouts (46% of sessions
stuck in the ablation; loop detection is mandatory); generic personas →
environment mismatch (they request things that don't exist — "product not
found" 43.6% vs 36.4%); intent-only agents → statistical noise; reasoning-effort
reduction → error rates 0.5–0.75% → 4.5–10.9% (don't starve the model to save
pennies); correlated bursty agentic traffic breaking serving assumptions;
trust failure in the wild — merchants treating directional output as proof
(the #1 criticism in reviews); surface exclusions — anything off the simulated
surface (headless storefronts, accessibility, low-end devices, real latency)
is simply not tested.

## 3. Mapping to our product

Our app: Expo (web + Android + iOS), calendar + coach chat + steered proposal
writes + settings; PocketBase (pockethost in prod), Worker coach API
(OpenRouter, BYO keys), proposal apply path lives only in the Worker. We also
have an eval harness that already validates in memory with zero intervals.icu
calls — this is the same discipline extended from *payloads* to * UX*.

**Personas (what each needs).** Three artifacts per persona, mirroring
SimGym's intent/persona split:

- **Data shape** — a seeded local-PocketBase state: user + settings row
  (units, weekly-hours goal, plan style), calendar events (planned runs,
  races with `category: RACE_A|B|C`), recent activities, wellness rows, coach
  chat history. Grounded, not generic — SimGym's generic-persona ablation is
  our warning: a marathon-block persona whose calendar has no marathon event
  will fabricate friction that no real user would hit. Build seeds as JSON
  fixtures per persona (a `tools/sim_seed.mjs` sibling of `pb_sync.mjs`).
- **Goal statement** — terse, outcome-shaped, no UI opinions, exactly like
  SimGym's two-sentence template: "You are 8 weeks from a half marathon and
  your calendar is mostly empty. Ask the coach for a plan and act on what it
  proposes." The *friction should emerge* from the gap between goal and UI.
- **Behavior calibration** — a few scalars: approval propensity (never / sometimes /
  always — tests the modal both ways), patience (max retries before giving up),
  chattiness (asks follow-ups vs one-shot), data verbosity. Five dimensions
  worked for SimGym; 3–5 is plenty for us.

**Environment isolation (what must hold).**

- **Local PocketBase** provisioned by `tools/pb_setup.mjs` (schema of record,
  idempotent) and seeded per persona; Worker runs via `wrangler dev` +
  `.dev.vars`, pointed at local PB, with the OpenRouter key budget-capped.
- **The steered-writes invariant is the whole point of the sandbox**: the
  apply endpoint (`/api/proposals/:id/apply`) must be unreachable or stubbed
  in the sim environment. Personas *approve and reject proposals in the modal*
  — that's UX signal — but nothing is ever applied, and the sim backend never
  holds intervals.icu credentials. Zero writes to intervals.icu (read-only
  GETs to *shape* fixtures at seed time are fine). This is non-negotiables #1
  and #2 restated as environment config, not policy.
- **Budget-capped LLM**: pin the coach roster to the cheapest adequate
  OpenRouter models for the run (see `docs/research/openrouter-models-brief.md`),
  cap per-session tokens in the Worker, and keep the model choice recorded in
  the run doc. Shopify's cost lesson scaled to us: capability floor, not
  ceiling, per agent.
- **Surface: web first.** SimGym's headless blind spot has an exact analog —
  Expo native automation is our "not a theme" problem. Run the swarm against
  the Expo web export in Playwright (accessibility snapshots = SimGym's
  accessibility-tree perception, already our non-vision verification mode per
  the working agreement). Android/iOS swarms come later via the emulator
  plugin, only after web findings stop being embarrassing.

**Feedback capture (per-persona structured docs).** One directory per run
(`.scratch/simgym/run-YYYYMMDD/`), one doc per persona: `personas/<name>.md`
(human-readable: goal, trace narrative, where stuck, likes, dislikes,
improvement ideas, task completion) + `personas/<name>.json` (machine-readable:
action list, stuck-points, proposal outcomes, frictions with severity +
surface tag). Dual format because the synthesis agent consumes JSON but the
Maintainer spot-checks md. Every friction claim must cite a concrete step
("tapped Approve, nothing appeared to happen, retried twice") — no vibes-only
entries.

**Synthesis role (PM agent → prioritized issues).** One PM-agent pass over
all persona JSONs + traces: cluster duplicates into themes, discard
single-persona one-offs, rank by (frequency × severity × surface), and emit
**candidate issues in our existing vocabulary** — F-\* functional before V-\*
visual before N-\* nice-to-have, per the sequencing rule — each with quoted
persona evidence and a directional-confidence label. The Maintainer reviews
and promotes to `docs/ISSUES-VISION.md` / Gitea. Nothing auto-files: the sim
is a screen, the human is the verdict (our steered-writes philosophy applied
to our own backlog).

## 4. First-swarm runbook (10–15 personas, ~$0.50 total)

**Setup (once, ~half a day).**

1. `node tools/pb_setup.mjs` against a **local** PocketBase; add
   `tools/sim_seed.mjs` that takes a persona fixture JSON and seeds local PB
   (events/activities/wellness/chat history) idempotently.
2. Worker config: `.dev.vars` → local PB URL, OpenRouter key, **model pinned
   to cheapest adequate roster entry**, per-session token cap on. Apply
   endpoint stubbed (returns 403 with "sim environment"). Record the config
   in the run doc.
3. Build web export (`pnpm dev:web` or `expo export:web` served locally);
   Playwright session with accessibility-snapshot verification.

**Persona roster (12 — trim to 10, extend to 15 later).** Each = fixture +
goal + 3–4 behavior scalars:

| # | Persona | Seeds | Goal (terse) | Calibration |
|---|---|---|---|---|
| 1 | First-run newbie | empty calendar, no sync | get set up and see something useful | patient, curious, never approves |
| 2 | 8-weeks-out half marathoner | race event, thin plan | get a plan onto the calendar | approves selectively |
| 3 | Data-heavy marathoner | full 12-mo history, wellness rows | understand load/balance, adjust next week | chatty, skeptical |
| 4 | Proposal-skeptic | normal season | evaluate a proposal, reject it | rejects everything |
| 5 | Over-eager approver | normal season | try the coach's suggestion | approves everything (tests validation/guardrails) |
| 6 | Injury-return runner | 3-wk gap in activities | come back safely | cautious; expect red-flag routing |
| 7 | Low-data user | sparse wellness | fill gaps, get value anyway | low patience |
| 8 | Settings tinkerer | normal season | tune units/zones/goals | methodical, never chats |
| 9 | Chat-first beginner | minimal data | ask naive training questions | very chatty |
| 10 | Multi-sport triathlete | bike+swim+run events | balance three sports | moderate |
| 11 | Race-week anxious user | RACE_A in 6 days | final check on the week | time-pressured, approvals matter |
| 12 | Night-before user (mobile viewport) | race tomorrow, small screen | check tomorrow's session | mobile web viewport, fast taps |

**Budget math (~$0.50 hard cap).** 12 personas × ~30–40K tokens/session
(≈ SimGym's session size, plenty for 15–20 actions + one coach conversation +
2–3 proposal interactions) ≈ **~450K tokens total**. On a cheap OpenRouter
tier (~$0.10–0.30/M input blended, outputs capped) that's **~$0.05–0.15**;
the synthesis pass (all JSONs through one mid-tier model, ~50K tokens) adds
pennies. The $0.50 cap is therefore ~3× headroom, not the target. Enforce
with: per-persona max-turns (15) + max-tokens (40K) in the driver, a run-level
token counter that aborts the swarm at 500K, and the pinned cheap model.
SimGym's warning applies in miniature: don't cut the *coach's* model quality
below adequacy to save cents — error rates jumped ~10× when they starved
reasoning effort; a broken coach produces worthless feedback.

**Batching.** Three waves of four, run sequentially (not parallel — one local
PB, one Worker, trivially rate-safe, and sequential keeps attribution clean):

- Wave 1 — calendar surface: 2, 3, 10, 11 (plan-creation and proposal flows).
- Wave 2 — chat surface: 6, 9, 1, 7 (coach quality, onboarding, red flags).
- Wave 3 — edges: 4, 5, 8, 12 (rejection paths, guardrails, settings,
  mobile viewport).

After each wave: eyeball the traces *before* burning the next wave on a broken
environment (the paper's bad-session flags — loops, intent mismatch — are our
driver's abort conditions too).

**Per-persona feedback format** (`personas/<name>.json`):

```json
{
  "persona": "half-marathoner", "surface_focus": "calendar+proposals",
  "tasks": [{"goal": "...", "completed": true, "steps": 9, "retries": 1}],
  "frictions": [{"surface": "proposal-modal", "severity": "high",
                 "what": "Approve tap gave no visible feedback for ~3s",
                 "evidence_step": 7}],
  "likes": ["plan arrived day-by-day without forms"],
  "dislikes": ["couldn't tell which events were proposals vs real"],
  "improvement_ideas": ["badge proposal events differently"],
  "coach_quality": {"grounded": true, "hallucinated": false, "notes": "..."},
  "tokens": {"in": 31000, "out": 4200}, "model": "<roster entry>"
}
```

…plus a ~10-line human md summary per persona. No free-form "vibes" without
an evidence step.

**Synthesis inputs & output.** Feed the PM agent: all 12 JSONs + md summaries
+ the run config (models, caps, seed versions) + `docs/ISSUES-VISION.md`
existing issues (dedupe against them). Output: a ranked candidate list —
theme, affected surfaces, frequency (n/12 personas), severity, quoted
evidence, proposed issue title in F-\*/V-\*/N-\* form, directional-confidence
note — plus a "did not converge / persona environment was wrong" section.
Maintainer promotes winners to real issues; the run doc and persona docs stay
in `.scratch/simgym/` as evidence.

**Definition of done for the run.** ≥10/12 personas complete their primary
task without environment-caused failure · zero writes outside local PB (assert
in the driver) · every friction claim has evidence · synthesis ranked list
exists with citations · findings folded into the next ui-builder/coach-tuner
iteration, with the "too unreliable to decide" lesson respected: sim findings
open investigations, they don't close them.

---

### Sources

- [Shopify Help Center — SimGym](https://help.shopify.com/en/manual/online-store/simgym)
- [Shopify Engineering — "2000 robots walk into a shop"](https://shopify.engineering/simgym) (Feb 2026)
- [SimGym: Traffic-Grounded Browser Agents for Offline A/B Testing — arXiv:2602.01443](https://arxiv.org/abs/2602.01443) (Castelo et al., Shopify)
- [The Rundown — SimGym features/pricing/limits](https://www.therundown.ai/tools/shopify-simgym)
- [Contra Collective — critical review](https://contracollective.com/blog/shopify-simgym-ai-shopper-simulation-2026)
- [Shopify blog — How Retail AI Agents Work](https://www.shopify.com/blog/ai-agents-retail)
- [SimGym app reviews](https://apps.shopify.com/simgym/reviews) ("too unreliable to serve as a basis for decision-making")
- [AgentA/B — arXiv:2504.09723](https://arxiv.org/abs/2504.09723) (Stanford)
- [Generative Agents — arXiv:2304.03442](https://arxiv.org/abs/2304.03442)
- [HN Algolia — SimGym stories](https://hn.algolia.com/api/v1/search?query=Shopify%20SimGym&tags=story); [r/UXResearch on synthetic-user tools](https://www.reddit.com/r/UXResearch/comments/1ptitut/)
