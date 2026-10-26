# Persona review — Maya, The Marathon Planner

> Multiple sub-3:15 marathons, ~45km/week, data-savvy but time-poor. I want hands-off
> build planning with an honest weekly check-in, and I train slightly faster than goal
> pace. I get irritated by vanity metrics, clutter, and wasted clicks. Tested live on the
> QA stack (`http://127.0.0.1:8788`, mock PB `:8090`, mock worker `:8099`) as
> `qa-marathon@intervals.test` — 45km/wk marathon build, run club Tuesdays, RACE_A goal
> marathon ~9 weeks out, 4 days of wellness/HRV. Dark theme, 1280×800 desktop pass then
> 375×812 mobile pass. Production was never touched; the one proposal approval exercised
> the mocked worker only.

## How I drove it

Custom Playwright driver (`.scratch/swarm/maya/driver.mjs`): sign-in → week view scroll →
month toggle + day taps → day detail via run-card tap → coach chat ("What should I adjust
this week?") → ask the coach to schedule something → approve the proposal via the modal →
settings → sign out. Every step screenshotted and registered through
`tools/shot_registry.mjs` (agent `maya`, 38 entries under
`qa-screenshots/registry/2026-10-26/92c936f/maya/`, `latest/maya/*` for the newest).
Screenshots referenced below as `desk-*` / `mob-*`.

Environment note for the Maintainer: on arrival, `tools/qa_mock_llm.mjs` was squatting
port 8099 while the app expects the mock **worker** there, and the worker had died of
`EADDRINUSE` (`logs/mock-worker.log`). The app correctly showed "Proposals unavailable:
Coach service unreachable (http://127.0.0.1:8099)". I killed the LLM mock and started
`qa_mock_worker.mjs 8099`. Also: `qa_stack.sh stop_all` kills `pb.pid`/`llm.pid` but never
the worker (`mock.pid` is not read) — that's how the port got stolen.

## Step-by-step

### 1. Sign-in — works, sparse (`desk-01/02`, `mob-01/02`)
Email + password + disabled "Google — coming soon", password eye toggle. Clean, dark,
zero fluff. Still no forgot-password or create-account path — fine for QA, a real athlete
hits a wall here.

### 2. Calendar week view — the strongest screen in the app (`desk-03/04`, `mob-03/04`)
Today (Mon 26) sits at the top of the week, day-strip pills with the today ring, per-day
rows with distance/time/load icons, explicit moon-icon Rest days, PLANNED chips on every
future session, week hero with DISTANCE/TIME/LOAD/FORM. My seeded build reads exactly as
I wrote it: run club Tuesday, steady Thursday with 4k at Z3, 26k long run Sunday, and the
goal marathon waiting in December. The mobile layout is genuinely good — one thumb, no
clutter.

But two things made me distrust the numbers on first read (see CONFUSING 1 and 2).

### 3. Month view + day taps (`desk-05/06/07`, `mob-05/06/07`)
Dots legend (planned/recorded/race) is a nice touch and matches the seed. Selecting a day
opens a right-side panel (desktop) or bottom sheet (mobile) with "Open full". Two problems:
on desktop the day-detail card at the bottom is occluded by the floating tab bar with no
visible scroll cue (`desk-05`), and only the *selected* day's cell exposes an accessible
"Open … details" affordance — my driver could not target any other day, and neither can a
screen reader (`desk-06/07` are identical shots for that reason).

### 4. Day detail via run card (`desk-08/09`, `mob-08/09`)
Tapping the Sunday long-run card opens the day panel — fast, correct data. The panel is
thin (name, PLANNED, time · sport) and pushes you to "Open full" for anything meaty;
acceptable, one extra click.

### 5. Coach: "What should I adjust this week?" (`desk-10/11`, `mob-10/11`)
Empty state sets the right expectation: "The coach sees your calendar, recent activities
and fatigue. Changes it proposes show up as approvals — you decide." Reply streams fast,
"via server" transport labeled, model shown. BUT the reply content is where the QA stack
undercuts the app: *"three easy runs, one interval session Tuesday, and the long run
Saturday … 38km planned with a load of 142"* — my seeded week is **53km / 275 load** with
the long run **Sunday** and my only Tuesday session is run club. The numbers contradict
the hero card sitting one tab away. That's the canned QA mock, not the real prompt — but
it means **groundedness is unverified by this walk** (see CONFUSING 3).

### 6. Coach: ask to schedule → approve the proposal (`desk-13/14/15`, `mob-13/14/15`, `probe-*`)
This is the make-or-break loop and it failed twice, then worked once:

- **Both driver passes (desktop and mobile) got a hollow, dead modal.** It auto-opened
  with just "Add to calendar" + Approve/Dismiss — no run name, no date, no distance, no
  coach rationale. I clicked Approve (twice, with waits). Nothing: zero network calls to
  `/api/proposals/:id/apply` (confirmed in worker logs), proposal still `pending` in PB,
  no error, no busy state, modal just sits there. I would be asked to approve a blind,
  inert sheet. (`desk-13/14/15` are pixel-identical; same for `mob-13/14/15`.)
- **A focused probe run got the correct modal** (`probe-modal-good`): rationale strip
  first, "Add **Easy mock run**", WHEN 2026-11-03 · 07:00:00, NAME, CATEGORY, DISTANCE
  5.0km, DURATION 30m, SPORT, workout bar + "5.0km · Z2 Pace" with a "View workout text"
  expander, and the clause "You approve every change — not sure? Keep chatting to adjust
  it; nothing is written yet." Approve → `POST /api/proposals/:id/apply` → 200, status
  `applied` in the DB. When it hydrates, this modal is genuinely trustworthy design.

So the approval path is flaky, not broken-by-design: an intermittent hydration race
(suspects: the SSE `proposal` → modal path in `apps/expo/src/lib/api.ts:139` vs the
re-list effects at `apps/expo/app/(app)/coach/index.tsx:625-631` feeding
`src/components/ProposalModal.tsx`). Same probe also surfaced **one chat message creating
three proposal rows** (one applied, two stray `pending` — PB timestamps 21:08:46/47/50),
so retries/duplicates are in the loop too. Duplicates on a calendar I approve line-by-line
is exactly the failure mode this product promises to prevent.

The "N pending proposals to review" queue banner + Coach tab badge is the right recovery
surface, and it did appear in the probe (`probe-modal-good`).

### 7. Settings (`desk-16/17`, `mob-16/17`)
Best copy in the app. Athlete ID + write-only API key ("hold the eye to check what you
typed"), Test connection, "Sync status: ok · synced 10m ago", model roster with DEFAULT
tag, and an ATHLETE PROFILE box: "Given to the coach with every conversation" — my
"45km/week, sub-3:10 in 9 weeks, prefers over-preparing" line is first-class input, not a
buried preference. Units km/mi, appearance System/Light/Dark. Mobile wraps the email
address awkwardly mid-string (`mob-16`, low). Save profile reads as disabled even when
it may just be idle-dirty-gated — ambiguous affordance (low).

### 8. Sign out (`desk-18`, `mob-18`)
One click, back to /sign-in, session actually cleared. Clean.

## Structured feedback

### LIKED
- **"You approve every change — nothing is written yet."** The contract is stated in the
  product, in the empty state, and under every Approve button. This is the one sentence
  that makes me trust a coach with write-adjacent access. (desk-10, probe-modal-good) — high
- **Week view is a training diary, not a dashboard.** Today first, planned chips, rest
  days shown on purpose, load per session, sync staleness ("synced 10m ago") right in the
  header. No vanity metrics anywhere. (desk-03, mob-03) — high
- **Athlete profile "given to the coach with every conversation"** with a 4000-char budget
  and counter. My constraints live where the coach reads them. (desk-17) — high
- **Write-only BYO keys** with hold-to-reveal, plus Test connection and sync status.
  Honest security posture I don't have to think about. (desk-16) — med
- **The hydrated proposal modal**: rationale first, every field of the change, workout
  text expander, Dismiss always available. When it works, it's exactly how I want to
  approve a calendar change. (probe-modal-good) — high
- **Month dots legend + pending-proposals queue banner + tab badge.** Small touches that
  respect a time-poor athlete. (desk-05, probe-modal-good) — med

### CONFUSING
- **Hero stat pairing is unlabeled.** Big number vs small flag number is *recorded vs
  planned* — I decoded it from the data (40.8km recorded October vs 93.5km planned;
  53.0km/275 planned this week), but nothing says so, and in week view the big slots are
  literal "—" dashes so the card looks broken until you work out that "no recordings yet"
  is the message. Label them "recorded / planned" or show "X of Y". (desk-03/04/05,
  mob-03/05) — **high**
- **Session-type chips contradict the session names.** "Easy aerobic + strides" is tagged
  **Intervals**; "Run club — 8×(2' Z4 / 2' easy)" is tagged **Easy**; "Steady 10k w/ 4k
  Z3" gets nothing. Root cause is mechanical: `apps/expo/src/lib/week-view.ts:94` matches
  the name with first-hit rules, so `strides?` outranks `easy` in my easy day, and
  `8×(2'…` (paren between × and 2) misses the `\d\s*[x×]\s*\d` rep pattern and falls
  through to "easy". A Z4 session labeled Easy is exactly the kind of wrong I can't
  forgive in a training log. (desk-03/04, mob-03) — **med**
- **QA mock's coaching numbers contradict the seed**, so I cannot judge groundedness from
  this walk: "38km planned, load 142, long run Saturday" vs the visible 53km/275 and a
  Sunday long run; "three easy runs" when Tuesday is a Z4 session. The real prompt may be
  perfectly grounded — but this stack can't prove it, and anyone demoing on QA will see
  the coach misstate the athlete's week. Worth swapping the canned replies for
  seed-derived numbers or documenting them as fixed. (desk-11/13, mob-11/13) — med
- **FORM "-1 · neutral"** — no scale, no direction; the ⓘ exists but I shouldn't need it
  weekly. (desk-03) — low
- **Desktop month view: the selected-day card hides under the floating tab bar** with no
  visible scroll affordance. (desk-05) — low

### BROKEN
- **Flaky hollow proposal modal with dead Approve/Dismiss.** 2 of 3 sessions: modal
  auto-opens with no rationale/name/date/distance; clicking Approve does nothing — no
  network call (worker log empty of `/apply`), proposal stays `pending`, no error, no busy
  state, Escape is the only exit. 1 of 3 sessions: fully hydrated modal, apply → 200.
  Suspected hydration race between the SSE proposal event and the re-list effects feeding
  `ProposalModal` (`apps/expo/src/lib/api.ts:139-166`,
  `apps/expo/app/(app)/coach/index.tsx:477-531,625-631`,
  `apps/expo/src/components/ProposalModal.tsx`). This is the approval flow — the product's
  entire promise — failing silently, and *intermittent* is worse than *always*: I can't
  tell a dead button from a slow one, so I either double-approve or abandon. Evidence:
  desk-13/14/15, mob-13/14/15 (hollow) vs probe-modal-good (hydrated, applied). — **high**
- **One scheduling ask produced three proposals.** Probe run: a single "Schedule an easy
  6k shakeout this Friday" left 1 `applied` + 2 stray `pending` rows (PB created
  21:08:46/47/50). Either the client retries `/api/chat` without dedup or the worker
  double-streams; either way, duplicate writes one approval away from a cluttered sacred
  calendar. (PB evidence; no screenshot surface — it's a data bug) — **med**
- **Month view non-selected days have no accessible detail affordance** — only the
  selected day exposes "Open … details"; keyboard/AT users can't discover other days'
  content. (desk-06/07 identical) — med

### WISH
- **Label the recorded/planned hero pair**, and give the week card a verdict line I don't
  have to ask for ("planned 53km · recorded 8km · on track"). My weekly check-in should
  start on this screen, not in chat. (desk-03) — high
- **Fix the tag rules, or drop them.** Confidence-gated classification (distance/pace/
  duration-based, not name keywords) or no chip at all; a wrong chip is worse than no
  chip. (`apps/expo/src/lib/week-view.ts:94-103`) — med
- **Make the approval loop failure-loud.** If the modal can't hydrate, say so and offer
  retry; if apply fails, keep the error visible (the failed-state code path exists — it
  never triggered because the click was a no-op). A pending-proposals "inbox" with
  retry/dismiss per item would make the queue banner a first-class rescue path. — high
- **Surface the goal race on the calendar hero.** I live 9 weeks from a RACE_A marathon
  and nothing on week/month says "goal marathon · 60 days" without opening December. A
  countdown chip next to FORM would do. — med
- **Coach replies with receipts**: inline chips for the numbers cited ("53km planned",
  "load 275") that link to the week they come from, so I can audit the coach in one tap. — med
- Sign-out on web could ask "sync is running — sign out anyway?" if a sync is in flight
  (didn't hit it, but I looked for it). — low

## Verdict

**Would I run my build on this today? Not yet — but the bones are right, and the fix
list is short and specific.**

The calendar is the first training tool I've walked in this stack that respects a
planner: planned vs rest is explicit, load is per session, the profile feeds the coach
directly, and the approval contract is stated everywhere it matters. The hydrated
proposal modal is the best trust design in the app — rationale first, every field,
"nothing is written yet."

But the core loop failed me twice out of three tries. An approval sheet that opens empty
and swallows clicks — silently, intermittently — is disqualifying for a product whose
entire pitch is "you approve every change." Fix the hydration race, kill the duplicate
proposals, label the recorded/planned hero numbers, and correct the session tags, and
this becomes something I'd trial on a real block. Groundedness of the coaching itself
remains unproven on the QA mock (its canned numbers contradict the seeded calendar), so
before I trust the advice, I want the eval-log evidence the coach-tuner is required to
ship — my calendar can't tell the difference between a grounded coach and a confident
one.

*Tested only against 127.0.0.1 QA services. No production URLs, no real athlete writes.
Password not reproduced anywhere in this report.*
