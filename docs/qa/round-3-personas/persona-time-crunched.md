# Persona review — The Time-Crunched Club Runner

> Mid-30s, job + kids, 3-4 runs/week. I read training apps in 30-second windows, one-handed,
> before coffee. I don't self-coach — I want to be told what today and this week look like, and
> moving a session when life blows up should be trivial. Reviewed from static screenshots,
> phone-width (375px) primary.

## Flow reactions

### 1. splash-hero — 👍 works
"You approve every change" — got the concept in one line, no onboarding video required. Clean,
fast, done in 5 seconds.

### 2. splash-scrolled — 👍 works
The 80/20 bar and "1-2-3 how it works" cards scan in ten seconds without reading the paragraphs.
I didn't glaze over once. That's a good landing page for someone like me.

### 3. splash-footer — 👍 works
Fine. Disclaimer is one short block, not a wall of legal text.

### 4. sign-in — 👍 works
Two fields, one big button. Would be done in 15 seconds. ("Google — coming soon" is a shrug but
doesn't slow me down.)

### 5. calendar-week-current — 🤨 doubt
The week summary strip (distance/time/load, planned vs actual) is readable at a glance — good.
But "today" is Saturday and it's *not on screen*: I open the app before my run and I have to
scroll past Monday's completed runs and two rest days to find what's on for today. Today's
session should be the first thing I see, pinned, with "today" on it.

### 6. calendar-week-current-scrolled — 👍 works
There it is: Sat 24 with a "today" pill, planned "Aerobic maintenance 50m · load 46" plus my
done run underneath. The planned-vs-actual pairing per session is genuinely nice — blue line
(plan), checkmark line (done). If I'd seen this first, this whole screen is a thumbs up. Put
today at the top.

### 7. calendar-week-next — 👍 works
Next week's shape reads instantly: Mon easy+strides, Tue club, Wed rest, Thu easy+strides, Fri
recovery, Sat something. The little blue planned lines with distance/time/load is exactly the
density I want — headline numbers only, no data tables. 

### 8. calendar-month — 👍 works
Dots-only month grid is fine for "how busy does the month look" — and honestly I'd rather have
dots than a wall of tiny titles on a phone. The header totals (126.7km → 105.0km) give me the
month in one line. No complaints at phone width.

### 9. day-detail — 🤨 doubt
Whoa — color-coded warmup/main-set/cooldown breakdown is *way* more than I need for a Tuesday,
but it doesn't get in the way: title, time, distance, load at top, details below. My only real
issue: the raw text block at the bottom repeats everything I just read. Dead weight on every
workout screen.

### 10. day-detail-scrolled — 👍 works
RECORDED section with the zone bar and "8.8km · 48m · 3:00/km · 156bpm · load 92" — that's my
club night in one line. The little colored legend is skippable, which is the right kind of
detail. COROS badge = it came from my watch, fine.

### 11. coach-empty — 🤨 doubt
"Ask your coach anything" — okay, but as a non-self-coach I don't actually know what to ask. The
three example prompts help; "Plan my race week" is the only one that sounds like my life. What I
actually want is the coach to just *talk first*: "Here's your week, here's what I changed and
why." The "1 pending proposal" banner at top is great though — that's the tap I'd make.

### 12. coach-conversation — 🤨 doubt
The content is actually perfect for me — "Today: Recovery jog 30m… Tue: Run club, reps capped
because of HRV… Fri: rest day instead if legs are heavy" is a coach telling me the week in
plain sentences with plan-B options. But it's visually dense: wall of text with literal
asterisks showing. At 7am pre-coffee this needs bullets/chips, not a markdown blob. Also: the
week it describes (Mon 26 → Sun 01) is *next* week while my calendar says today is Sat 24 —
took me a second.

### 13. coach-streaming-reply — 🤨 doubt
"Planned total: ~50km, modest step up, within ramp limits" — good, that's the summary I want
*first*, not after seven session bullets. The Watch items paragraph is the coach earning trust,
but again: dense prose, asterisks showing, one giant grey block. If this were three chips
(Week: 50km / Load: ▲ / Watch: HRV) I'd be delighted.

### 14. proposal-modal — 🤨 doubt
The mechanics are ideal for me: approve/dismiss, "nothing is written yet", and the italic
rationale explains the swap in one sentence. But the title says "Delete calendar entry" — for a
*swap*? To do one thing (move Thursday's run) I apparently approve a delete, then find another
modal for the add. When my kid's daycare closes and I need to move a run in 20 seconds, two
modals with scary red trash icons is friction.

### 15. proposal-modal-timeline — 👍 works
This one's better: when (2026-10-29 · 18:00), what (Z4 cruise intervals 3×2km), the workout
steps, approve/dismiss. If every proposal looked like this card, I'd never feel nervous
approving. (Still no sign of the *original* Thursday session it's replacing, and "#147702969"
in the title is noise.)

### 16. settings-account — 👍 works
I pasted my intervals.icu key once in real life; the "Test connection" + "synced 1h ago" status
is more than enough. Doesn't get in my way.

### 17. settings-ai-model-picker — 👍 works
Model picker with a DEFAULT badge means I can ignore it — correct. The athlete profile box is
pre-filled with text that sounds like me, which is reassuring ("club sessions Tuesday" — it gets
my life). I'd never scroll through a textarea of prose though.

### 18. settings-preferences — 🤨 doubt
Theme + km/mi: done. But "Save changes" is a lone button at the very bottom — I changed a unit,
missed the save, closed the app, change gone. Autosave or a sticky save bar, please. This is
exactly the kind of app where I never scroll to the bottom of settings.

### 19. signed-out — 👍 works
Signed out lands me back at sign-in cleanly. No drama.

## Specialty: glanceability & plan-break handling
- 30-second test fails on the most important day-state: **today is not first** in week view. Fix
  that one thing and my daily loop (open → see today → go run) works.
- The **Coach tab badge "1"** for pending proposals is a genuinely great pattern — I always know
  when the coach wants something from me.
- Plan-break handling *looks* good (proposal flow with rationale + keep-chatting) but feels
  two-step for the most common break: "moved my Thursday run to Friday" should be one
  conversation turn and one approval, not a delete modal + an update modal.
- Nothing on any calendar screen says what today's session is *for* ("easy", "quality") in
  human words at the list level — the titles mostly do the job, to be fair. Minor.
- No widget/quick-glance surface, no "next 7 days" strip on the Coach home — the coach empty
  state wastes its prime real estate on marketing copy when it could show today + this week.

## Top 5 asks (prioritized)
1. **Pin today at the top of week view** (auto-scroll/anchor on open, "today" chip already
   exists) — the single biggest daily-loop win.
2. **One-swap-one-approval**: collapse delete+add proposals into a single move/swap modal with
   before → after shown in one card.
3. **Coach home = my briefing**: replace the marketing empty state with today's session, the
   week's headline (km/load vs plan), and pending proposals — then the input box.
4. **Render coach replies as formatted content** (bold/bullets, no literal asterisks) and lead
   with the "Planned total / verdict" line, details after.
5. **Autosave settings** (or sticky save bar + dirty indicator) — never let a Save button
   live off-screen at the bottom of a scroll page.
