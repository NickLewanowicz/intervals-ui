# Round 1 — visual review of https://intervals.imnick.dev

Reviewer: visual-reviewer · 2026-10-24 · production deploy (Expo web export)
Method: every flow walked in the Playwright browser at **375×812** and
**1280×800**; screenshot + console check at each step
(`qa-screenshots/round-1/01–23`). No proposal approved, no setting saved.
Code read (read-only) only to pin root causes for FIX prescriptions.

## Verdict table

| Flow | Verdict | Findings |
|---|---|---|
| Splash `/` (V-01) | **FIX** | 80/20 section buried + weightless; books section missing; disclaimer incomplete |
| Sign-in `/sign-in` | **PASS** | clean; empty-submit error state works; Google honestly disabled |
| Calendar week + day detail (V-02) | **FIX** | [functional] page cannot scroll on web; [functional] Sync hits localhost; no last-sync timestamp on calendar; zone-times bar missing; race badge unverifiable (no RACE in data) |
| Calendar month + stats (V-07) | **FIX** | stats strip stale ("week of Nov 2", all dashes) while in month view; planned/recorded dots same color |
| Coach chat (V-03) | **FIX** | [functional] chat dead in prod (localhost worker); "(no reply)" placeholder; advice footer note missing; model chip truncates at 375px |
| Proposal modal (V-04) | **BLOCKED** | unreachable in prod — worker never reached; re-review after FIX-1 |
| Settings (V-05) | **FIX** | model picker shows no selected/default state; key inputs lack show-toggle; raw `10/24/2026, 7:05:01 PM` timestamp |
| Sign out → sign in | **PASS** | clean redirect both ways; week view default on re-entry |
| Theme system (V-06) | **PASS** (1 cosmetic FIX) | grayscale + single accent applied consistently on every screen; exactly one hex literal outside `theme.ts` |

Console: 6 errors total, **all** `net::ERR_CONNECTION_REFUSED @ http://localhost:8787/...`
(`api/chat`, `api/sync`, `api/proposals`). No React warnings, no other errors.

---

## FIXes, ordered by impact

### FIX-1 · [functional] Production web build calls `localhost:8787` — chat, sync and proposals are all dead
- Shots: `17-coach-streaming-desktop.png`, `14-sync-feedback-desktop.png`, `16-coach-empty-desktop.png`
- Wrong: the deployed app fetches `http://localhost:8787/api/chat|sync|proposals`
  (connection refused). The user-visible errors even say "— is it running?",
  which is nonsense advice in production. The coach — the product's
  differentiator — cannot be used at all on the deployed site. Root cause:
  `apps/expo/src/lib/api.ts:15` falls back to `http://localhost:8787` when
  `EXPO_PUBLIC_WORKER_URL` is unset, and the Cloudflare Pages build doesn't set it.
- Change wanted: **set `EXPO_PUBLIC_WORKER_URL=https://intervals-coach.imnick.workers.dev`
  in the Pages build environment** (and make the fallback fail loudly, not silently, in prod builds).
- Structural. Blocks V-03/V-04 verification. (Calendar data works because PocketBase
  is read directly — only worker calls are dead.)

### FIX-2 · [functional] No screen scrolls on web — wheel, drag and touch all dead
- Shots: `07-calendar-week-mobile-scrolled.png` (Sun 25 unreachable), `15-calendar-month-desktop-1280.png` (bottom 2 week rows unreachable)
- Wrong: every tab screen renders its ScrollView with `overflow:hidden` on web.
  Mouse wheel, pointer-drag and synthetic touch produce `scrollTop: 0`;
  only programmatic scrollTop moves it. Content below ~760px is unreachable:
  the last day(s) of the week at both widths, the bottom two week-rows of the
  month grid at 1280×800, and everything past the first viewport of Settings.
  Verified on `/calendar` (week + month) and `/settings`. Root area: `Screen`
  wrapper, `apps/expo/src/components/ui.tsx:20` (plain RN `ScrollView` inside
  expo-router tab screens; RN-web renders it non-scrollable here).
- Change wanted: **make the `Screen` ScrollView actually scroll on web — set
  `overflow-y: auto` (Platform.web style override or RN-web-supported ScrollView
  props) and verify wheel + drag at 375 and 1280.**
- Structural. Affects every screen.

### FIX-3 · V-07 — month view shows a stale week's stats with all-dash values
- Shot: `09-calendar-month-mobile.png` (caption "planned vs actual · week of Nov 2", every metric "—"), also `10-…november.png`, `15-…desktop.png`
- Wrong: switching to Month keeps rendering the last-viewed *week's* stats
  strip — in month view it reads "week of Nov 2" with "— → —" everywhere while
  the visible month (October) is full of data. Dishonest labeling, exactly
  what V-07 says must never happen.
- Change wanted: **in month view, re-title the strip "planned vs actual · October 2026"
  and aggregate the visible month (4–5 weeks) instead of the stale week.**
- Structural (data scope change, small).

### FIX-4 · V-02 — day detail has no zone-times bar
- Shots: `11-day-detail-mobile.png`, `12-day-detail-mobile-bottom.png`
- Wrong: zone data renders as prose ("Z3 7m · Z1 11m · Z2 2m · Z4 9m · Z5 6m ·
  Z6 8m · Z7 2m") — unreadable as a distribution; V-02 prescribes a
  proportional stacked bar. This is the core "how hard did it actually go"
  read (planned-vs-actual principle #2).
- Change wanted: **render `zone_times` as one proportional stacked bar
  (segment width ∝ minutes, cool→hot tint by zone) with minute labels, in the
  RECORDED block of each event card.**
- Structural.

### FIX-5 · V-01 — the 80/20 section is the product anchor but is buried and weightless
- Shots: `01-splash-desktop-1280.png`, `01b-splash-desktop-fullpage.png`, `02-splash-mobile-375.png`
- Wrong: prescribed order is Hero → **80/20** → books → how-it-works →
  disclaimer. Actual order is Hero → how-it-works → a flat 80/20 card that
  looks identical to the step cards above it. "Where the coaching comes from"
  (*80/20 Running*, Fitzgerald & Johnson; *Run Like a Pro*, Fitzgerald &
  Rosario) is missing entirely — the card only says "distilled training books".
  Disclaimer omits "do your own due diligence".
- What a strong version needs (structure): (1) 80/20 gets its own full-width
  section directly under the hero — display-size headline ("80% easy. 20%
  fast."), 2–3 sentences, and one graphic that *shows* the split (e.g. an
  80/20 proportional bar using the intensity tokens) — it must outweigh every
  other section; (2) a "Where the coaching comes from" block citing both books
  by title + author as the coach's distilled knowledge base; (3) how-it-works
  3 steps after it; (4) disclaimer gains the due-diligence clause.
- Change wanted: **reorder the splash to Hero → 80/20 anchor (headline + 80/20
  split bar graphic) → books citation section → how-it-works → disclaimer,
  and add the missing due-diligence clause.**
- Structural (content order + one new section); the split-bar art itself is cosmetic.

### FIX-6 · V-02 — calendar has no last-sync timestamp
- Shots: `05-calendar-week-mobile-375.png`, `13-calendar-week-desktop-1280.png`
- Wrong: "Sync now" is there, but last-sync lives only in Settings
  ("Sync status: ok · last sync 10/24/2026, 7:05:01 PM"). V-02 wants sync
  freshness visible where the data is read.
- Change wanted: **put "synced <relative-time>" beside the Sync now button**
  (e.g. "synced 2h ago"), tapping it going to Settings sync status.
- Cosmetic-to-structural (needs the timestamp surfaced from the PB record).

### FIX-7 · V-05 — model picker shows no selected/default state
- Shots: `20-settings-mobile-bottom.png`, `21-settings-desktop-1280.png`
- Wrong: all three radio rows render hollow ○ even though GLM 5.3 Flash is
  active (the Coach screen names it). A user can't tell what's saved; V-05
  requires the default marked.
- Change wanted: **fill the radio of the saved model (● + accent border) and
  tag the roster default with a small "default" chip.**
- Cosmetic.

### FIX-8 · V-05 — key inputs have no show-toggle
- Shots: `19-settings-mobile.png`, `21-settings-desktop-1280.png`
- Wrong: API-key fields are write-only with no way to verify what you typed
  (V-05 prescribes masked + show-toggle). Typos = silent coach failure.
- Change wanted: **add an eye toggle that reveals the field's text for as long
  as held/pressed (never persists).**
- Cosmetic.

### FIX-9 · V-03 — chat error state renders "(no reply)" as an assistant bubble
- Shot: `17-coach-streaming-desktop.png`, `18-coach-error-mobile.png`
- Wrong: when the request fails, the transcript shows a gray bubble reading
  "(no reply)" plus red error text — developer shorthand surfaced to users.
  (The red error line itself is good practice.)
- Change wanted: **replace the "(no reply)" bubble with a single retryable
  error row ("Coach unreachable — retry") that re-sends the message.**
- Cosmetic (copy/state), pairs with FIX-1.

### FIX-10 · V-03 — chat is missing the "Educational — not medical advice" footer
- Shots: `16-coach-empty-desktop.png`, `18-coach-error-mobile.png`
- Wrong: V-03 prescribes a small advice-disclaimer footer in the chat; absent
  at both widths (splash has one, chat doesn't).
- Change wanted: **add a one-line muted footer above the input: "Educational —
  not medical advice."**
- Cosmetic.

### FIX-11 · V-06 — one hex literal outside the theme
- `apps/expo/src/components/ui.tsx:202` — `buttonPrimaryText: { color: '#0d0d0f' }`.
- Change wanted: **replace with a theme token (e.g. `colors.bg` as
  on-accent text) so screens stay 100% token-fed.**
- Cosmetic.

### FIX-12 · V-02/V-07 — month-view dots don't separate planned vs recorded (cosmetic)
- Shot: `09-calendar-month-mobile.png`, `15-calendar-month-desktop-1280.png`
- Wrong: planned ◦ and recorded ● are both accent blue; the a11y tree
  distinguishes them ("1 planned, 1 recorded") but the eye can't at dot size.
  Races also have no distinct dot (unverifiable — see BLOCKED note).
- Change wanted: **tint recorded dots white/text color (or accent) and planned
  dots muted gray; reserve the race tint (#e0a458 family) for RACE dots.**
- Cosmetic.

### Minor / notes (no FIX required this round)
- Model chip truncates at 375px ("Model: GLM 5.3 Flash (default — fas…") —
  shorten to model name only on narrow widths. Cosmetic.
- Settings sync timestamp format is raw `10/24/2026, 7:05:01 PM` — prefer
  relative ("2h ago") consistent with FIX-6. Cosmetic.
- Desktop week view keeps the phone-style stacked list in a centered column —
  acceptable minimal, but a 7-column week grid is the obvious desktop
  upgrade. Defer (N).
- Zone label "S3 7m" appears among Z-labels in one day-detail entry (data
  quirk from mirror or label map) — check zone naming. `[functional-minor]`
- Empty weeks render as uniform "—" rows (honest but cold); friendly-empty is
  prescribed for V-02 "done when" — acceptable for now, revisit with V-13.

## BLOCKED / unverifiable in production (re-verify after FIX-1)
- **V-04 Proposal modal** — never reachable (worker unreachable). The full
  V-04 checklist (bottom-sheet vs centered modal, action verb, category chip,
  monospace description block, applied/failed states, idempotent Approve) is
  unreviewed. Do NOT mark V-04 done.
- **Streaming render (V-03)** — unobservable for the same reason.
- **Race badge / "races shout" (V-02)** — no RACE event exists in the mirror
  (November is empty through Nov 30). Seed a RACE_A event to validate
  badge + raceTint + stats handling of race weeks.

## What already works (keep)
- Week view reads in <3s: ✓ + blue actuals line vs muted planned line,
  today outline + chip, honest "8.1km → 30.3km" stat arrows, "planned vs
  actual · week of …" caption.
- Day detail hierarchy: title → meta line → description block → RECORDED block.
- Sign-in: inline validation, honest disabled Google button, clean desktop card.
- Coach empty state: model chip, example prompts, "you decide" trust copy.
- Settings: write-only key handling, sync status present, units segmented
  control with visible selected state.
- Grayscale + single blue accent is applied consistently across every screen;
  dark-first holds everywhere; touch targets ≥44px throughout.

## Overall design-readiness
**Not shippable today; plausibly beta-ready after one focused FIX round.**
The visual system is coherent and the calendar — the home screen — is already
close to the "read the week in 3 seconds" bar. But the deployed product is
functionally half-dead (FIX-1 worker URL, FIX-2 scroll), the core
differentiator (coach → proposal → approve) is unverifiable in production,
and the splash undersells the product's actual idea (FIX-5). Fix FIX-1/2
first, then V-01/V-02/V-07 visuals, then re-run this review to clear the
BLOCKED items (V-04, streaming, race badge).
