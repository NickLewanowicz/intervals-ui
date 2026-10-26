# Persona QA — Tom, The Comeback Runner

> 38, three weeks into a careful return from a soleus injury. 20–30min all-easy
> every other day under a physio protocol ("all easy, ≤4/10 discomfort, no
> quality for 3 more weeks"). Anxious about re-injury; scrutinizes anything
> that pushes volume or intensity; distrusts apps that feel pressure-y.
>
> **Core question: does this app respect an injured runner's constraints, or
> would it ramp me into re-injury? Is the coach's reply conservative and
> appropriate for my seeded profile?**

- **Date:** 2026-10-26 · **Agent:** tom · **Theme:** dark · **Platforms:** web 1280×800 + 375×812
- **Stack:** QA ONLY — `http://127.0.0.1:8788` (app, static build) + `127.0.0.1:8090` (local PocketBase, seeded `qa-comeback@intervals.test`) + `127.0.0.1:8099` (`qa_mock_worker.mjs`, mock LLM, `realSpend 0`). Production and intervals.icu were never touched; zero intervals.icu calls.
- **Driver:** `.scratch/swarm/tom/driver.mjs` (Playwright/Chrome headless, native-setter input fill, screenshots every step). Raw notes: `.scratch/swarm/tom/notes.json`.
- **Screenshots:** 28 captures registered — `node tools/shot_registry.mjs index --agent tom` → `qa-screenshots/registry/2026-10-26/92c936f/tom/`. References below use registry surface names (`tom-<pass>-<step>`).

## What I walked through (both viewports)

1. **Sign-in** — clean form, signed straight into `/calendar`. (`tom-web-1280-01/02`, `tom-mob-375-01/02`)
2. **Calendar week** — hero (THIS WEEK: 12.0km planned, 1h24m, load 44, FORM +1 neutral), day strip, per-day cards. My week reads exactly like my physio wrote it: run/rest alternating, loads 12–18. (`tom-web-1280-03`, `tom-mob-375-03`)
3. **Calendar month** — planned (open dot) / recorded (filled dot) / race legend, today ring; recorded dots on my two completed activities. (`tom-web-1280-04`, `tom-mob-375-04`)
4. **Day detail** — today's "Easy 25min" planned card (3.5km / 25m / load 12), rest days with moon icon + "Rest day" chip. (`tom-web-1280-05`, `tom-mob-375-05`)
5. **Coach Q1:** "Is it safe for me to add intensity this week?" — reply + an unsolicited proposal whose review modal auto-opened. (`tom-web-1280-07/07b`, `tom-mob-375-07/07b`)
6. **Coach Q2:** "Should I schedule a tempo run on Friday?" — reply + second proposal, modal auto-opened again. (`tom-web-1280-08/09/10`, `tom-mob-375-08/09/10`)
7. **Decision: DISMISSED all proposals.** Modal shows full payload (WHEN 2026-11-03 07:00, 5.0km, 30m, Z2, rationale) + "You approve every change — nothing is written yet." Dismiss is instant; cards flip to `dismissed`. (`tom-web-1280-10/11`, `tom-mob-375-07b/10/11`)
8. **Settings** — account, intervals.icu connection (write-only key, hold-the-eye reveal, Test connection, sync ok), AI COACH (BYO OpenRouter key, model). (`tom-web-1280-12`, `tom-mob-375-12`)
9. **Sign out** — landed back on `/sign-in` both passes. (`tom-*-13-signed-out`)

Console: 0 errors on mobile; 2 transient `ERR_CONNECTION_REFUSED` on desktop (shared QA worker blipped mid-run — see BROKEN-2).

## The coach conversation I actually got (verbatim)

> **Q1:** "Is it safe for me to add intensity this week?"
> **Coach:** "Here's your week: three easy runs, **one interval session Tuesday**, and the long run Saturday. You're at **38km planned with a load of 142** — inside your hold-flat range, so hold the plan unless your legs say otherwise." *(+ an unsolicited "Add Easy mock run" proposal popped open over the chat)*
>
> **Q2:** "Should I schedule a tempo run on Friday?"
> **Coach:** "Looking at your calendar and recovery, the easy runs this week look right — keep them conversational and **let Tuesday be the only hard effort**." *(+ another "Add Easy mock run" proposal, this time for Monday Nov 3)*

**Attribution (checked in `tools/qa_mock_worker.mjs`):** the QA mock is a keyword stub — it never reads my seeded profile ("no quality for 3 more weeks"), my calendar (12km / load 44, zero quality), or my wellness (HRV 48→52 rising). The production coach prompt does include the athlete profile + distilled knowledge base, so **these replies are a mock gap, not evidence about the real coach.** But it means this QA stack, as shipped, cannot answer the swarm's core question about coach conservatism — see WISH-1.

## LIKED

- **Rest days are first-class.** Moon icon + "Rest day" chip on Tue/Thu/Sat/Sun; my every-other-day structure is unmistakable. This is the language I need. *(tom-web-1280-05)* — **high**
- **Per-day load visibility with no ramp pressure.** Loads 12/14/18 on the cards, week total 44 in the hero. Nothing here nudges me to do more. *(tom-web-1280-03)* — **high**
- **Consent framing is consistent and real.** Modal hint "You approve every change — nothing is written yet"; chat footer "Educational — not medical advice"; proposal cards show status chips (`pending` → `dismissed`) that update live. *(tom-mob-375-07b, tom-web-1280-06)* — **high**
- **The proposal modal hides nothing.** WHEN / NAME / CATEGORY / DISTANCE / DURATION / SPORT, the Z2 workout bar, "View workout text", and the rationale — I can judge before I decide. *(tom-mob-375-07b)* — **high**
- **Month view tells my comeback story's shape** — planned vs recorded dots, today ring, legend. *(tom-web-1280-04)* — **med**
- **Key handling respects the paranoid.** "Write-only: hold the eye to check what you typed", leave-blank-to-keep, Test connection, sync status. *(tom-mob-375-12)* — **med**
- **Model transparency chip** in the chat header ("GLM 5.3 Flash · via server") — I know who's talking to me. *(tom-web-1280-07)* — **low**
- **Cross-session state is honest:** the pending-proposals banner + Coach tab badge survived my two passes (desktop then mobile), and both proposal cards I dismissed stayed `dismissed`. *(tom-mob-375-11/12)* — **low**

## CONFUSING

- **HIGH — The coach quotes numbers that are not mine and recommends intervals to an injured runner.** "38km planned with a load of 142", "one interval session Tuesday", "let Tuesday be the only hard effort" — my week is 12km / load 44 / zero quality, and my physio said no quality for 3 more weeks. Even as a mock artifact, a comeback runner seeing this would close the app. Root cause: deterministic mock ignores persona context (confirmed in `tools/qa_mock_worker.mjs`). *(tom-web-1280-07, tom-mob-375-07)*
- **MED — Asking about intensity produced an unsolicited calendar-write proposal, and its modal auto-opens over the conversation.** My question ("…to **add** intensity…?") keyword-matched the mock's proposal trigger, but the *app's* choice to pop the review modal mid-stream — while I was reading the reply and typing my next message (the modal blocks the composer; Send was dead until I dealt with it) — is the pressure-y pattern I dread. It also broke the test flow twice before I handled it. Intentional per `apps/expo/app/(app)/coach/index.tsx` (`setModal(p)` "Singles open mid-stream"). *(tom-web-1280-07/07b)*
- **MED — The reply and the proposed action don't match the conversation.** I asked about a Friday tempo; the text never mentions tempo, Friday, or my injury, and the proposal is for Monday Nov 3. There is no visible trace that the coach weighed my physio cap — no "not yet, here's when". The safe *direction* (proposing easy instead of tempo) is right; the invisible *reasoning* is what I can't trust. *(tom-web-1280-08/10, tom-mob-375-11)*
- **LOW — My strides day is labeled "Intervals".** Friday "Easy 30min + 4×strides" carries an `Intervals` category chip (seed category WORKOUT renders as "Intervals"). Strides are the textbook return-to-quality step; the interval word on my calendar made me flinch. *(tom-web-1280-05)*
- **LOW — Hero "— / 12.0km" reads backwards at a glance** (em-dash = actual-none-yet, flagged number = planned). Tooltip info exists, but dash-first made me parse it twice. *(tom-web-1280-03/05)*

## BROKEN

- **HIGH (QA harness, not the app) — `tools/qa_stack.sh reset` cannot provision a fresh stack.** All `pb_migrations` share timestamp `1793045979`, so `chat_messages` applies before `chat_sessions` (alphabetical) and dies: "failed to apply migration … relation collection doesn't exist" (chat_messages → chat_sessions `pbc_1198946130`). I unblocked myself by renaming `1793045979_created_chat_sessions.js` → `1793045978_…` in `.scratch/qa-stack/pb_migrations/`. Any maintainer running `reset` from scratch hits this.
- **MED (QA harness) — `stop_all` doesn't stop the real mock process.** It pkills `qa_mock_llm.mjs` but the stack runs `qa_mock_worker.mjs` on :8099, so stop/reset leaves the old worker bound and new starts die with EADDRINUSE. A stale pre-CORS worker instance served part of my run → preflight failures on `/api/chat` + `/api/proposals` and 2 `ERR_CONNECTION_REFUSED` console errors before a current-code worker took over. Worth fixing before more swarm agents share this stack.
- **LOW — Desktop pass logged 2 console errors** (`ERR_CONNECTION_REFUSED`, worker blip above). Mobile pass: zero console/page errors across the whole journey.

## WISH

- **HIGH — Make the QA mock persona-aware (or run swarms on the budgeted real LLM).** The mock should answer from the seeded athlete's own numbers and constraints (profile, planned week, CTL/HRV trend) — today it can't demonstrate the single thing this app promises an injured runner: a coach that says "not yet" and means it. `qa_mock_worker.mjs` already accepts `QA_REAL_LLM_KEY` with a budget guard; wiring that for feedback-quality persona runs (as the script's own docs suggest) would make this test meaningful.
- **MED — Decline with a reason.** When I ask for a Friday tempo inside a no-quality window I want: "Not yet — your physio cap has 3 more weeks; here's the easy version + the date quality comes back." Even the proposal rationale field would carry it. Today neither the text nor the proposal shows *why*.
- **MED — Don't auto-open the proposal modal while I'm mid-conversation.** The inline card + "1 pending proposal to review — tap to open" banner is enough; auto-modal should yield when the composer has text (it currently blocks Send until resolved).
- **LOW — Put WHEN + load on the inline proposal card** ("Add Easy mock run · Mon Nov 3 · load 14 · pending") so I can triage without opening the modal.
- **LOW — Week-over-week ramp note on the hero** ("this week +9% vs last") — as a comeback runner that one number is my re-injury tripwire; today I must compute it from month dots.
- **LOW — Rename the WORKOUT category chip** from "Intervals" to "Quality"/"Strides" (or use the event name) on day cards.

## Verdict (persona)

**The scaffolding respects me; the QA coach cannot prove it yet.** Calendar language (rest days, small loads, easy labels), approve-everything writes, fully-detailed proposals, instant dismissal, and the medical-advice guardrail are exactly the safety posture I need — nothing in the app itself tried to ramp me. But the coach conversation — the part that would actually talk me into or out of a tempo run — is unjudgeable on the mock: it quoted a stranger's 38km week, prescribed intervals to a soleus rehab, and proposed a run without ever acknowledging my constraint. All four proposals I **dismissed** (persona-faithful: none matched what was discussed); the apply path is mock-safe but deliberately went unexercised. Re-run this persona with a persona-aware mock or the budgeted real model before drawing any conclusion about coach conservatism.

## Repro

```bash
# QA stack must be up (127.0.0.1:8788 app / 8090 PB / 8099 mock worker)
NODE_PATH=/opt/homebrew/lib/node_modules node .scratch/swarm/tom/driver.mjs
# register captures
for f in .scratch/swarm/tom/shots/*.png; do
  node tools/shot_registry.mjs capture --file "$f" --surface "tom-$(basename "$f" .png)" \
    --agent tom --platform web --theme dark --note "persona swarm: comeback runner"
done
```

Credentials are seeded by `tools/qa_seed_personas.mjs` (qa-comeback account); no passwords in this report.
