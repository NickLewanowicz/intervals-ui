# QA round — PROPOSAL-BUNDLE (Bo, the Bundle Tester)

- **Date:** 2026-10-26 · **Stack:** QA only — app `http://127.0.0.1:8788`, mock worker `:8099`, PocketBase `:8090`. Production never touched.
- **Account:** `qa-marathon@intervals.test` (marathon-build persona; targets: Tue `Run club — 8×(2' Z4 / 2' easy)`, Thu `Steady 10k w/ 4k Z3`, Sun `Long run 26k`). Credentials are the QA swarm persona password, not repeated here.
- **Harness:** `.scratch/swarm/bo/driver.mjs` (Playwright, headless; desktop 1280×800 + mobile 375×812 passes). Raw results `.scratch/swarm/bo/results.json`; per-phase logs `s1–s4.log`; probes `probe_retry.mjs`, `probe_a11y.mjs`.
- **Screenshots:** 17 captures registered via `tools/shot_registry.mjs` (`--agent bo`, surfaces `bundle-*`, web/dark) — see list at the bottom.

---

## The headline: bundled or separate?

**Bundled.** The exact task prompt — *"This week is too much for me. Cut Tuesday's run club, Thursday's steady run, and Sunday's long run all down by about a third — same reason."* — was sent as a live chat turn at ~17:00 while the QA worker's real-LLM proxy was armed. The model returned **3 `update_event` tool calls all sharing one `bundle_key`**, and the app opened **ONE bundle sheet** (`[data-testid="bundle-sheet"]`), titled *"Too-big week — trimming all sessions ~33%"* with a *"3 changes"* badge and the shared reason rendered once. Not three modals. (Earlier rounds' "three separate modals with the same reason repeated" failure mode did not reproduce.)

Because the worker's real-LLM env flapped during the round (see infra notes), the full behavioral sweep was then driven deterministically by seeding the identical proposal shape (3 pending `update_event` rows, one `bundle_key`, identical rationale) into QA PB and driving every UI path from the pending bar. **38/38 automated checks pass, 0 console errors.**

## Per-check results (all PASS)

| Area | Check | Result |
|---|---|---|
| Arrival | Pending bar counts the 3-row bundle ("3 pending proposals to review — tap to open") | PASS |
| Arrival | Tap opens ONE sheet with 3 checkbox rows, "3 changes" badge, bundle summary in header | PASS |
| Shared reason | Rationale strip (coach avatar + reason) rendered exactly once — not repeated per row | PASS |
| Default state | All 3 rows checked → "Approve selected (3)" | PASS |
| Multi-select | Uncheck one row → "Approve selected (2)"; batch POST carries exactly the 2 checked ids | PASS |
| Multi-select | Uncheck all → "Approve selected (0)" and the button is **disabled** | PASS |
| Detail | Row expand shows category/sport/when + proposed workout timeline | PASS |
| Batch apply | All-checked approve (3) → exactly 3 rows applied, pending bar clears | PASS |
| Partial failure (injected 1-of-2) | Sheet **stays open**; banner "Applied 1 of 2 — resolve the remaining rows below."; per-row chips `applied` + `failed` both render; retry button scoped to "Approve selected (1)" | PASS |
| Retry | Only the failed row is re-posted; server row really applies | PASS |
| Server truth | Sheet chips mirror the batch response; the pending bar refetches server truth (a faked "applied" chip does NOT persist as applied) | PASS |
| Reload | Pending count + statuses persist across reload (PB rows are the record; the transcript intentionally resets to an empty chat on reload — restore via Chats list) | PASS |
| Remainder regroup | After resolving some members, the pending bar re-opens a correctly-sized **2-row bundle sheet**; multi-select works again inside it | PASS |
| Lone-member fallback | One remaining bundled member opens the **single modal**, not a 1-row bundle sheet | PASS |
| Dismiss all | Two-tap confirm ("Tap again to dismiss all") → all rows dismissed in one action, pending bar clears | PASS |
| Double-submit | Rapid double-click on "Approve selected" fires exactly **1** apply-batch POST | PASS |
| Mobile 375×812 | Sheet layout intact (title wraps, 3 rows + diff bars visible, both actions reachable); multi-select works | PASS |
| Cleanup | Approvals/dismissals on QA mock only; calendar mirror untouched by design (mock apply flips proposal status; no intervals.icu writes anywhere) | PASS |

## LIKED

- **The v2 promise holds.** One sheet, one shared reason (avatar strip, read first), per-item checkboxes default-checked, "you pick what applies" — the coach's trim arrives as one coherent package, not three approval rounds.
- **Per-row diff bars** (`DISTANCE −3.0km · -33%` / `DURATION −15m · -33%`) make "what changes" scannable without expanding anything. This is the best part of the sheet.
- **Partial-failure state is excellent**: the sheet stays open, applied/failed chips land per row, the banner names the split ("Applied 1 of 2"), and the retry is scoped to just the failed row.
- **Dismiss-all asks twice.** A bundle-wide destructive action with a two-tap confirm is the right call.
- **State converges on server truth.** Chips, pending bar, and reload all agree; nothing I did (including injecting lies into the batch response) left the UI in a stuck state.
- **375px holds up**: wrapped title, truncating clause, intact action row.

## CONFUSING

1. **(medium) The happy path closes too fast to see.** On full success the sheet snaps shut instantly — the per-item `applied` chips (the visual payoff of item-by-item approval) are only observable on partial failure. A ~1s "2 applied · 1 skipped" beat before closing would show the multi-select actually mattering.
2. **(low) Mobile button label wraps** — "Approve selected (3)" breaks onto two lines at 375px.
3. **(low) Header clause truncates mid-word** on mobile ("One review for related cha…").
4. **(info) Keyboard toggle is Enter, not Space** — the inverse of the checkbox convention (see BROKEN #2).

## BROKEN

1. **(high — accessibility) Row checkboxes expose no state.** The row toggle renders `<div role="checkbox" tabindex="0" aria-label="Include …">` with **no `aria-checked` attribute at all** — verified in DOM (`accessibilityState={{ checked }}` is passed in `ProposalBundleSheet.tsx` but never lands in the ARIA output). A screen reader announces "Include Update Run club — 8×(2' Z4 / 2' easy), checkbox" with no on/off state. WCAG 4.1.2. Fix is one mapping away in the RNW accessibilityState path.
2. **(medium — accessibility) Space does not toggle a focused checkbox** (Enter does). Keyboard users get a checkbox that ignores the standard key; combined with #1 the rows are effectively opaque to non-mouse users.
3. **(low — coach content, from the live turn) Distance down, duration up.** The 17:00 model bundle trimmed each run's distance ~33% but proposed **duration increases** on two rows (run club `+6m · +13%`, steady `+5m · +12%`) — an internally inconsistent "cut". The sheet rendered it faithfully (bars flipped to green `+`), but nothing flags a trim that isn't. Coach-tuner/validator followup, not a UI bug.

## WISH

- A brief post-batch summary state (see CONFUSING #1): keep the sheet open ~1s with settled chips + "2 of 3 applied — 1 left for later".
- `aria-checked` + Space-to-toggle on the row checkboxes.
- "Approve selected (2)" could name the noun — "Approve 2 of 3 sessions" reads more like a training decision than a dialog.
- When an expanded row's proposed duration moves *opposite* to distance, a small "check this" hint would have caught BROKEN #3.

## Biggest single improvement to the bundle UX

**Let the user see the batch settle.** Keep the sheet open for a beat on success — per-row `applied` chips already exist; add a one-line footer ("2 of 3 applied — 1 skipped") before auto-close. It turns an instant sheet-vanish into visible proof that item-by-item selection was honored, which is the entire point of the bundle.

## QA-stack infra notes (for the maintainer, not app bugs)

- **`tools/qa_mock_worker.mjs` dies on malformed bodies.** `JSON.parse` in the apply/dismiss-batch handler has no try/catch; a single garbage request (observed: body `[object Object]{"ids":[…]}`, most likely from another persona's tooling) throws, exits the process, and every persona's in-flight POST gets `ERR_EMPTY_RESPONSE` until the supervisor restarts it. Wrap the parse → 400.
- **Real-LLM arming flaps across restarts.** The 8099 worker was armed (`QA_REAL_LLM_KEY`, $0.35 budget) at 17:04 and unarmed after the 17:16 restart; bundle rounds need it armed. Spend this round: <$0.02 total.
- **Parallel personas share one PB and `qa_seed_personas.mjs` wipes ALL workflow rows** — two of my runs were rug-pulled mid-phase. Round-trip resilience added to the driver (own-rows-only cleanup, wipe detection, phase retries).

## Registry (agent `bo`, web/dark)

`bundle-baseline` · `bundle-arrival` · `bundle-row-expanded` · `bundle-multiselect` · `bundle-all-unchecked-disabled` · `bundle-partial-failure` · `bundle-after-partial-apply` · `bundle-reload-persistence` · `bundle-remainder-regroup` · `bundle-leftover-single-modal` · `bundle-leftover-dismissed` · `bundle-all-applied` · `bundle-dismiss-confirm` · `bundle-dismissed` · `bundle-mobile` · `bundle-mobile-multiselect` · `bundle-mobile-applied` — all under `qa-screenshots/registry/2026-10-26/92c936f/bo/` (plus `latest/bo/`).
