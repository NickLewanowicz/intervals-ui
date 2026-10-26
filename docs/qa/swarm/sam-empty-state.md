# QA — Sam "Brand-New User" — First-Impression / Empty-State Round

- **Persona:** Sam — heard about the app, made an account, connected nothing. Judging the first 5 minutes.
- **Account:** `qa-empty@intervals.test` (seeded `emptystate` persona — zero events/activities/wellness/profile; creds per `tools/qa_seed_personas.mjs`, not repeated here).
- **Target:** QA stack only — web `http://127.0.0.1:8788`, PB `127.0.0.1:8090`, mock coach API `127.0.0.1:8099`. Production never touched.
- **Method:** Playwright headless, two fresh-context passes (desktop 1280×800, mobile 375×812 @2x): splash → Get started → sign-in → Calendar → Coach ("What should I do first?") → Settings, plus targeted probes (first-paint scroll state, Sync-now-with-no-key). Driver: `.scratch/swarm/sam/driver.mjs` (+ `probe.mjs`, `probe2.mjs`, `probe3.mjs`); raw results `.scratch/swarm/sam/results.json`.
- **Registry:** 20 captures under agent `sam` (sha `92c936f`) — `node tools/shot_registry.mjs index --agent sam`. Latest view: `qa-screenshots/registry/latest/sam/`. Note: headless Chrome rendered the **light** theme (system default); registered `--theme dark` per round convention, actual theme noted in each PNG's Note chunk.

**Zero console errors, zero page errors, both viewports, entire walk.** All interactions fast (sign-in → app ~2.5s; coach turn ~1.4s against the mock).

---

## Core question: would you get past minute one?

**Mobile: yes — comfortably.** The splash pitch lands, sign-in is obvious, and the empty calendar fits its guidance in one screen.

**Desktop: barely — and the minute contains one genuinely broken moment and one actively misleading one.**

1. On desktop the calendar's **first paint is scrolled past its own header** — you land on a truncated "Rest day" list with the week strip, metrics, sync button, *and the empty-state message itself* all hidden above the fold. It reads as a rendering bug.
2. Tapping **"Sync now" with no intervals.icu key stored reports success**: toast `Synced 0 events · 0 activities`. Nothing tells a never-connected user to go connect. Minute one teaches the user that syncing does nothing and the app pretends it worked.
3. Asked "What should I do first?", the coach answers with **invented training data** ("the easy runs this week look right… let Tuesday be the only hard effort") for an athlete whose calendar is seven rest days. (Reply text is the QA mock LLM's canned default — see caveats — but nothing app-side flags the dataless state either.)

Time-to-know-what-to-do: **~4s to a signed-in screen; on mobile the empty-state copy names next steps immediately; on desktop never at first paint.**

---

## Per-step verdicts

### 1. Splash `/` (desktop + mobile) — PASS, strong

> "Your training, coached." / "A simplified view of your intervals.icu — with an AI coach that plans, and you approve every change."

- **LIKED:** Pitch is concrete in one line; the approve-every-change promise is above the fold; the 80/20 method section ("80% easy. 20% fast.") gives credibility; live product screenshot; dual CTA (Get started / Sign in). Load ~1.7s.
- **CONFUSING:** "Google — coming soon" on sign-in only (see step 2). Nothing else. This is the best screen in the app.
- Verdict: pitch → CTA in under 2 seconds. Exactly what a first impression needs.

### 2. Sign-in `/sign-in` — PASS

- **LIKED:** Email/password labeled clearly, working reveal (eye) on password, "← Back" escape hatch.
- **CONFUSING:** "Google — coming soon" — a disabled button advertising a feature is a small trust tax for a brand-new user; plain email/password is fine, the button only invites "so when?".
- **WISH:** A one-line "New here? Create an account on intervals.icu first" hint — Sam's mental model after the splash is "intervals.icu, connected", and nothing says whether this account *is* an intervals.icu account.

### 3. Calendar empty — desktop **BROKEN**, mobile PASS

Mobile (375×812) is genuinely good: week strip + "Oct 26 – Nov 1" + Today, Week/Month toggle, `THIS WEEK` metric tiles (`—`, FORM: "no data yet"), the sync icon button, seven "Rest day" rows, and the empty-state card — all in one view.

> "No events in this window. Sync now, or ask your coach to plan something."

Desktop (1280×800) first paint (`registry latest/sam/viewport-firstpaint-dark-web.png`): the inner ScrollView mounts at `scrollTop: 272` — the whole header block (week nav, Today, Week/Month, THIS WEEK tiles, Sync now) sits at y≈-240, off-screen, and the empty-state card is below the fold. The user sees only a truncated "Monday 26 / Rest day…" list in a floating column with dead white space beside it. **The empty state's one job — telling you what to do — is invisible on desktop.**

- Cause: `apps/expo/app/(app)/calendar/index.tsx:138` — the mount effect calls `scrollToDate(today)` (added for persona finding #9, "don't start with a hunt for today"). With an empty week the scroll lands *past* the header instead of revealing it; the header lives inside the same ScrollView it scrolls (`:122–134`, `:499`).
- **LIKED:** the empty-state *copy* itself — it names two concrete next actions; `FORM — no data yet` is honest labeling; the header, once scrolled up (`calendar-header-visible` capture), is handsome.
- **BROKEN:** desktop first paint (above).
- **CONFUSING:** the message's "Sync now" is prose inside the `Empty` component (`apps/expo/src/components/ui.tsx:247` — icon + text only, no action slots). The real affordance is the header sync icon button ("Sync now") and the tiny "synced Xm ago" chip ("Sync status — open settings"), neither of which is visible on desktop first paint.
- **WISH:** make the empty card itself actionable (Sync button + "Connect intervals.icu" + "Ask your coach" deep-link), and skip the mount scroll when the week has zero events.

### 4. "Sync now" with no credentials — **BROKEN (guidance)**

Probe3, fresh sign-in, never connected: tap Sync now → toast `Synced 0 events · 0 activities`, header flips to "synced 2m ago", Settings shows "Sync status: ok". No error, no "add your intervals.icu API key first", nothing.

- **BROKEN:** a never-connected user is taught that sync works and yields nothing. This is the exact moment onboarding must intercept, and instead it confirms a false belief. App-side: a 0/0 result with no stored key should route to Settings ("Connect intervals.icu to import your training"). QA-side: `tools/qa_mock_worker.mjs` should mirror the real Worker's behavior for missing credentials instead of returning success.
- Caveat: on the QA stack the sync endpoint is the mock worker, so the *failure shape* is harness-defined — but "treat 0/0 as success with no credential check" is app logic that will bite in production too.

### 5. Coach, empty state — PASS with nits

> "Ask your coach anything." / "Plan my race week." · "I felt flat on Tuesday — why?" · "Build me back after 2 weeks off." / "The coach sees your calendar, recent activities and fatigue. Changes it proposes show up as approvals — you decide."

Chips: `What should I adjust this week?` · `Build my plan for next week` · `How's my fueling?`

- **LIKED:** The explainer sentence teaches the core contract (proposals → you decide) before the first message. Example prompts set tone. Reply arrives in ~1.4s; bubbles, markdown and layout are clean on both viewports. "Educational — not medical advice." disclaimer present.
- **CONFUSING:** All three chips *presume existing data* — "adjust this week?" and "fueling?" for an athlete with no history. This is the one screen that should meet a dataless user where they are ("What should I do first?" should be a chip).
- **CONFUSING (minor):** header chip "GLM 5.3 Flash · **via server**" is developer vocabulary; a new user doesn't know what a "transport" is (`Chat transport: via server. Tap to re-check.`). On desktop the left-aligned chips under a centered hero look accidental; large dead zone between hero and chips.

### 6. Coach: "What should I do first?" (dataless athlete) — **BROKEN (experience), with harness caveat**

Reply, verbatim:

> "Looking at your calendar and recovery, the easy runs this week look right — keep them conversational and let Tuesday be the only hard effort."

For Sam this is the moment the app loses the plot: seven rest days on screen, and the coach reviews a week of training that does not exist. No "you haven't connected data yet", no proposal, no connection nudge.

- **BROKEN:** dataless first turn produces confident confabulation instead of onboarding. Nothing client-side marks the turn (no banner, no chip, no "0 activities in context" indicator), so the user has no signal to distrust it.
- **Harness caveat (important):** the wording is the deterministic mock (`tools/qa_mock_llm.mjs`, `Reply()` default branch) — production model behavior is untested here by design. But two real gaps stand regardless: (a) the app never surfaces "this athlete has no data" in the chat surface, and (b) the mock should grow a dataless branch so this persona tests the *intended* empty-data behavior rather than a fiction. Recommend: mock returns a "no data yet — connect intervals.icu and I'll baseline you" reply, and/or the app prepends a visible context banner when `events+activities+wellness == 0`.

### 7. Settings — PASS with copy bugs

Sections: ACCOUNT · INTERVALS.ICU CONNECTION (Athlete ID, API key, Test connection, sync status) · AI COACH (OpenRouter key, model picker) · ATHLETE PROFILE · PREFERENCES.

- **LIKED:** This is the best onboarding *reference* in the app: "On intervals.icu: Settings → Developer shows both your athlete ID and API key." is exactly the pointer a new user needs; write-only key field with hold-to-reveal; "Test connection" as the explicit connect action; Athlete profile labeled "Given to the coach with every conversation".
- **CONFUSING:** Athlete ID placeholder is **`i167187`** (`apps/expo/app/(app)/settings/index.tsx:172`) — that is a *real production athlete ID* (the owner's). Showing it as the example invites typos that point at someone else's account. Use `i123456`.
- **CONFUSING:** API key + OpenRouter fields show "Leave blank to keep the saved key" on an account that has **no saved key**. Copy assumes an existing connection; for first-run it should read "No key saved — paste yours to connect".
- **CONFUSING (minor):** on desktop, scrolling content slides under the floating tab bar — the DeepSeek model option is partially covered at rest.
- Note: "Sync status: ok · synced 16m ago" for a never-connected account is a **QA seed artifact** — `tools/qa_seed_personas.mjs:218` writes a `sync_state` ok row for every persona, and the seeded user carries a fake `intervals_athlete_id` (`qa-emptystate`). App behavior can't be fully judged here; see QA-stack fixes below.

### 8. Onboarding path (connect → value) — the missing loop

The intended path exists but is never advertised: Calendar ("synced Xm ago" chip, aria-label "Sync status — open settings") → Settings → Athlete ID + API key → Test connection. Nothing on the calendar empty state, the coach empty state, or the coach's first reply ever mentions Settings or "connect". A brand-new user's two most likely first actions — "Sync now" and "ask the coach" — both silently succeed with zero data (steps 4 and 6). The loop closes only if the user independently decides to read Settings.

- **WISH:** one first-run banner ("Connect intervals.icu to bring in your training — Settings → intervals.icu connection"), shown while `events+activities+wellness == 0`, dismissible. That single element fixes steps 3, 4, 6 and 8 at once.

---

## Findings summary

| # | Sev | Where | Finding |
|---|-----|-------|---------|
| F1 | **BROKEN** | `apps/expo/app/(app)/calendar/index.tsx:138` | Desktop calendar first paint auto-scrolls (`scrollToDate(today)`) past header + empty-state card on an empty week; `scrollTop: 272` on mount, header at y≈-240. Skip scroll or reveal header when week has 0 events. |
| F2 | **BROKEN** | app sync flow + `tools/qa_mock_worker.mjs` | "Sync now" with no stored key toasts `Synced 0 events · 0 activities` (success). Must intercept: "Connect intervals.icu first" → Settings. Mock should mirror Worker's no-credentials behavior. |
| F3 | **HIGH** | coach surface + `tools/qa_mock_llm.mjs` | Dataless athlete's first coach turn returns confident invented-week advice; no app-side dataless signal. Add context banner and/or mock `Reply()` empty-data branch. |
| F4 | MED | `apps/expo/app/(app)/settings/index.tsx:172` | Athlete ID placeholder is real production athlete `i167187`. |
| F5 | MED | settings key fields | "Leave blank to keep the saved key" shown when no key is saved. |
| F6 | LOW | `tools/qa_seed_personas.mjs:218` + user seed | `emptystate` persona gets a `sync_state: ok` row and fake athlete id, contradicting the "never connected" premise this persona exists to test. Seed should skip both for `emptystate`. |
| F7 | LOW | settings desktop | Content scrolls under floating tab bar (model options partially covered). |
| F8 | LOW | coach header | "via server"/"transport" jargon; desktop chips left-aligned vs centered hero. |

**LIKED (keep):** splash pitch and 80/20 method section; mobile calendar one-screen empty state; empty-state copy that names next actions; settings' intervals.icu Developer-path hint; write-only key + hold-to-reveal; "Educational — not medical advice."; zero console/page errors across both passes; sub-2.5s sign-in→app.

## Recommended fixes, smallest-first

1. F1: guard the mount scroll — `if (events.length || activities.length) scrollToDate(today)` (or scroll only when today's card is below the header).
2. F5/F4: two copy/placeholder edits in settings.
3. F2: app-side 0/0-no-key guard → redirect to Settings; update `qa_mock_worker.mjs` to return the Worker's unconnected shape.
4. F6: seed fix so `emptystate` truly has nothing (re-run of `tools/qa_stack.sh reset`).
5. F3: coach dataless banner + mock `Reply()` branch; re-run this driver to verify the first turn guides instead of confabulates.

## Re-run

```
node tools/qa_stack.sh start          # QA stack (8788 web / 8090 PB / 8099 mock)
SAM_PASS=<persona pass> NODE_PATH=/opt/homebrew/lib/node_modules \
  node .scratch/swarm/sam/driver.mjs  # + probe.mjs probe2.mjs probe3.mjs
```
