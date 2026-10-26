# Jules — the skeptical partner (web, phone-size viewport)

**Agent:** jules-ff · **Date:** 2026-10-26 · **Surface:** web at `http://127.0.0.1:8788` (isolated QA stack), 390×844 viewport — I found this open on my partner's phone, so that's how I looked at it.
**Account:** qa-comeback@intervals.test ("QA Comeback").

> Who I am: I'm not the runner. My partner is — coming back from a soleus injury, and I'm the one who has heard "this app will keep me honest" before. I'm skeptical of subscription apps, I worry about them overdoing it, and I wanted to know what this thing actually does before it earns any of my patience when they're sore.

**Environment caveats (read first):**
- This QA stack serves a **deterministic mock LLM** (`tools/qa_mock_llm.mjs`) and a **mock worker** (`tools/qa_mock_worker.mjs`). Where the coach's *wording* is the issue, that's a mock artifact — I say so. Where the *app's behavior* is the issue (what the UI does with a reply, a proposal, a sign-out), that's real client behavior.
- The stack was shared with concurrent QA agents. One of them stole my browser tabs and killed my session mid-flow. I redid every sensitive check in **my own headless Chromium** (`.scratch/swarm/jules/jules-drive.mjs`) before believing it. Two findings below were initially caused by that contention and are labeled as such.
- 16 screenshots registered under `qa-screenshots/registry/2026-10-26/92c936f/jules-ff/` (index at the bottom).

---

## What I came to find out

1. Will this thing push my partner too hard, too soon?
2. Does it actually know *their* situation, or is it generic AI tips with their name on it?
3. When it "proposes" a change, can it touch the calendar without approval?
4. What does it cost, and where do our data and keys go?

---

## What won me over

- **The plan itself is right for a comeback.** Mon/Wed/Fri easy runs (3.5 / 4.0 / 4.5 km), every other day, four rest days. Week total 12 km, load 44. I know enough to know that's conservative, and the app doesn't apologize for it.
- **The physio's orders live in the app.** Settings → Athlete profile: *"Returning from a soleus injury. Physio: all easy, ≤4/10 discomfort, no quality for 3 more weeks"* — and the app says this is "given to the coach with every conversation." That is exactly where a constraint like that belongs, and it's the single biggest reason I didn't close the tab. (`settings-profile-keys`)
- **"Your training, right now" panel** (tap any of the Distance/Time/Load/Form tiles): fitness 18.5 vs fatigue 17.2, HRV 50.0, RHR 53, sleep 7h48m, and a plain sentence — *"the week sheds more than it loads."* It also shows a hold-flat target (≈118/wk) against the current 44, labeled "THE GAP." No macho metrics, no jargon without an ⓘ. This is the first screen that felt like it knew my partner rather than a demographic. (`training-status-panel`)
- **The approval promise is real in the UI.** The proposal modal shows exactly what would be added — date, name, category, distance, duration, a workout bar — with only Approve / Dismiss, and the footer: *"You approve every change — not sure? Keep chatting to adjust it; nothing is written yet."* I checked the calendar before and after: **nothing moved until I approved.** (`proposal-modal`)
- **"Educational — not medical advice"** is on the landing page and pinned under the coach input. If something hurts, it says see a professional. Good.
- **Keys are handled carefully on screen.** Both API key fields are write-only with hold-to-peek, default empty. I couldn't accidentally see a secret.
- **No subscription nag anywhere.** No paywall, no "upgrade" screen, no trial counter in anything I opened. BYO OpenRouter key means paying the model provider per use, not a fee to this app. I hate subscriptions; I didn't find one.
- **Chats persist.** In a clean session, Chat history showed both of my threads from earlier plus exact times. (`chat-sessions`)

## What would make me tell them to delete it

1. **The coach contradicts the calendar in the same app — and ignores the injury.** I asked, verbatim, about the soleus, the physio's "no quality for 3 more weeks," and how it stops them ramping. The reply: *"three easy runs, one interval session Tuesday, and the long run Saturday… 38km planned with a load of 142 — inside your hold-flat range, so hold the plan."* The actual calendar: **no Tuesday session, no Saturday long run, 12 km, load 44.** It recommended exactly the quality work the physio banned, then said "hold the plan."
   *Mock caveat:* that reply is the canned string from `tools/qa_mock_llm.mjs` — but the app presents it with the same authority as a grounded one. There is no visible signal distinguishing "read your data" from "recited a script." If the real model ever drifts this far, nothing in the UI would catch it. My partner would read "hold the plan" and go run intervals. This needs a grounding check the *user* can see (e.g., the reply citing the week it actually sees). (`coach-injury-reply`, `coach-reply-contradiction`)
2. **Approving a proposal is a black hole.** I approved "Add Easy mock run (Nov 3)." The modal closed and… nothing. No confirmation, no toast, no "view it on your calendar" link. The event never appeared on the calendar — **not even after tapping Sync now** (`next-week-after-approve`, `next-week-after-sync`). *Mock caveat:* the QA worker's apply endpoint only flips the proposal's status; it never creates the event, so the calendar absence may be a stack artifact. But the client silence is real either way: I cannot tell "applied" from "failed" from "wait for sync." For the one promise this app makes, the moment of trust is silent. Give me an "Approved — added to Tue Nov 3" state with a link, and an explicit failure state.
3. **A second session threw me out and made existing data look deleted.** Mid-flow I was dumped to the logged-out marketing page, and Chat history then said *"No chats yet."* The data wasn't gone (verified later — my threads were there), but for ten minutes the app told me my conversation with the coach didn't exist. Households share devices and accounts; a second login must not make the first person's history look erased, and an empty state must not claim "no chats" when a fetch failed. (Triggered by concurrent-agent contention on the shared stack; the *displayed* wrong-empty-state is the app's.) (`chat-history-empty`)
4. **Workouts have no explanation.** "Easy 25min" — easy relative to *what*? The day detail page shows title, PLANNED, and "06:00 · Run" and nothing else — no pace, no zone, no notes (`day-detail`). Worse: Friday's *"Easy 30min + 4×strides"* is categorized **"Intervals"** — the scariest possible word for the parent of a healing soleus — with no in-app explanation that a stride is a relaxed 15–20s acceleration. My partner either skips it out of fear or does it too hard. One sentence per workout would fix this.

## What confused me

- **The week summary tiles read "Distance — 12.0km".** The dash means "done so far: 0", the number is planned. I genuinely thought it was broken for a minute. Month view does this right (done ▮ / planned ▯ pairs side by side) — steal that pattern for the week tiles. (`month-view`)
- **"You're at 0 of 44 planned load against a hold-flat of ≈118/wk"** took two reads. The GAP card (118/wk · 44 · +74) is the clearer version — lead with that.
- **"Chat transport: via server. Tap to re-check."** I still don't know what I'd be re-checking, and I read the docs for a living-adjacent hobby. Translate it or hide it.
- **Proposal "WHEN 2026-11-03 · 07:00:00"** — no weekday, raw seconds. It's a Tuesday. Say "Tue Nov 3, 07:00."
- **After the coach proposes, the app flips you to the calendar — where the proposal is invisible.** The only hints are a tiny "1" badge on the Coach tab and a banner inside the coach screen I'd just left. I wandered between tabs looking for the thing it told me to review. Land me on the proposal, not near it.
- **Model picker in Settings** (GLM 5.3 Flash / Claude Haiku 5.5 / DeepSeek V4.1 Flash) implies I should have an opinion about LLMs. I don't, and my partner shouldn't have to. Default is fine; put the picker behind an "advanced" disclosure.

## Trust, privacy, and money notes

- **Where does the API key actually live?** Settings says the OpenRouter key *"Saving also stores it on this device: chat runs on this device when the key is saved locally."* That flatly contradicts the architecture I was told about ("keys stay server-side, read only by the Worker"). One of those statements is wrong, and the copy made me re-read it three times trying to figure out which. Also: an API key stored on a phone that a partner and a runner both handle is a real household question. Say plainly where the key is stored, and offer a "server-side only" default. (`settings-profile-keys`)
- **Athlete ID placeholder shows `i167187`** — which I understand is a *real production athlete id*, in the QA build's placeholder text. Sloppy leak; use `iXXXXXX`.
- **Console 401** (`auth-refresh`) fires for anyone who opens the landing page logged out. Harmless, but it's the app's first word to devtools.
- **"MISSED" in caps** on last week's walk/run entry. My partner missed one 20-min walk/run during the worst of the injury and the app shouts MISSED at them. Planned-vs-done honesty is good; shame isn't. Consider "not done."

## Verdict

**Keep — on probation.** The skeleton is honest: conservative plan, physio constraints as a first-class input, real approval gate, recovery data in plain language, no subscription. That's more than I expected from "an app with AI in it."

Three things flip me to "delete it":
1. The coach's reply must visibly reflect the athlete it's talking to (injury, actual week) — or visibly fail when it can't. A confident reply that contradicts the calendar one tab away is worse than no coach.
2. Approve must end with a confirmed, visible result (event on the calendar or an explicit error) — silence is how my partner ends up running on a sore soleus because "the app said it's fine."
3. Explain the workouts. "Intervals" as a label on strides, with no explanation, in an injury-return plan, is the one thing that made me want to take the phone away.

Fix those and I'll stop checking their pace on my own watch. Mostly.

---

## Screenshot index (qa-screenshots/registry/2026-10-26/92c936f/jules-ff/)

| Surface | What it shows |
| --- | --- |
| `landing` | Pitch page, top (phone size) |
| `calendar-week` / `calendar-week-clean` | Comeback week: Mon/Wed/Fri easy, 12 km, load 44, Coach badge "1" |
| `day-detail` | "Easy 25min" detail page — title/status/time only |
| `coach-empty` / `coach-empty-own` | Coach empty state; model chip + "via server" |
| `coach-reply-contradiction` / `coach-injury-reply` | Coach's "38km/interval Tuesday" reply vs actual 12 km week; ignores soleus question |
| `calendar-after-proposal` | Landed on calendar after proposal; nothing visible but the Coach badge |
| `settings-top` / `settings-profile-keys` | Account, intervals.icu connection (`i167187` placeholder), physio profile, BYO key copy, model picker |
| `chat-history-empty` | "No chats yet" after session kill (data existed) |
| `proposal-modal` | Proposal review modal — fields, Approve/Dismiss, "nothing is written yet" |
| `after-approve` | Post-approve: back to empty chat, no confirmation |
| `next-week-after-approve` / `next-week-after-sync` | Week of Nov 2: all rest days; approved event absent even after Sync now |
| `training-status-panel` | "Your training, right now": hold-flat 118 vs 44, CTL/ATL, HRV/RHR/sleep |
| `about-load-explainer` | TRIMP one-liner |
| `month-view` | Month grid + done/planned totals |
| `chat-sessions` | Chat history with both my threads (persistence works) |
| `after-signout` | Sign out → sign-in screen |

Raw captures + driver: `.scratch/jules-ff/`, `.scratch/swarm/jules/`.
