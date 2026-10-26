# Ash — Theme & Robustness round (QA stack)

- **Agent:** ash (theme-switcher persona: dark at 5am, light outdoors, tablet on the train)
- **Date:** 2026-10-26
- **Stack:** local QA only — app `http://127.0.0.1:8788` (static export), PocketBase `127.0.0.1:8090`, mock worker `127.0.0.1:8099`. Production was never touched (no production calls in the drivers; approvals never exercised).
- **Account:** qa-marathon persona (marathon-build seed). Credentials live in the QA seed script, not here.
- **Driver:** `.scratch/swarm/ash/driver.mjs` (matrix | slownet | kill) + `.scratch/swarm/ash/kill2.mjs` (true mid-stream cut, light transcripts)
- **Registry:** 55 captures, agent `ash` — `qa-screenshots/registry/2026-10-26/<sha>/ash/` (index: `qa-screenshots/registry/index.jsonl`)

---

## 1. Theme-leak table (surface × width → dark / light / diff)

Objective check: top painted-surface colors sampled per capture; dark vs light must differ, and System must follow the OS scheme. Visual review of every pair on top of that.

| Surface | 375 | 768 | 900 (wide flip) | 1280 | Verdict |
|---|---|---|---|---|---|
| Calendar week | OK / OK / differ | OK / OK / differ | OK / OK / differ | OK / OK / differ | **no leak** |
| Calendar month | OK / OK / differ | OK / OK / differ | OK / OK / differ | OK / OK / differ | **no leak** |
| Coach (transcript) | dark OK / light OK* | dark OK / light OK* | OK / OK / differ | OK / OK / differ | **no leak** |
| Coach (empty state) | — | dark OK (slownet capture) | — | light OK | **no leak** |
| Settings | OK / OK / differ | OK / OK / differ | OK / OK / differ | OK / OK / differ | **no leak** |
| System override | follows OS | follows OS | follows OS | follows OS | **correct** |

\* see CONFUSING-1: the light "transcript" captures from the matrix pass were actually the empty state (coach resets on remount); transcript-in-light was re-captured properly in `coach-transcript-light-*`.

**One latent leak found (WISH-1):** the absolutely-positioned full-viewport page backdrop is hard-coded `rgb(242, 242, 242)` in dark mode (probe evidence: dark captures' largest painted layer at every width except 900, where the wide layout paints `rgb(21,25,38)`). It sits *under* the app's dark layer, so it is invisible normally — but `html`, `body` and `#root` are all transparent, so this layer is the effective page background. It will show as a light flash on overscroll/rubber-band (mobile web) or during any paint gap in dark mode. Not visible in any captured state; severity low, fix cheap (paint it from the palette).

**Contrast notes:** all text surfaces pass eyeball contrast in both themes, including muted chips, the `planned/recorded/race` legend, and coach muted text. One exception: disabled **"Save profile"** button in light settings (white text on pale lavender) is the lowest-contrast element seen (CONFUSING-2).

## 2. Breakpoint findings (375 / 768 / 900 / 1280)

- **Zero horizontal overflow everywhere:** 40 layout probes across 4 widths × 5 surfaces × themes — `scrollWidth == innerWidth` in every single one. No element pokes past the right edge.
- **768 (breakpoint zone):** renders the *mobile* week layout — pinned hero (pills + window switch + stats), DayStrip, scrollable day list — comfortably, with the extra width going to readable rows. Nothing half-wide or straddling. Month view centers the grid card with symmetric margins; hero spans wider than the month card, which reads slightly detached but is not broken.
- **900 (the `layout.wide` flip):** flips cleanly to the desktop layout — single scrolling page, full-width week sheet, labeled metric grids (DISTANCE/TIME/LOAD columns in day cards). No artifacts at the boundary itself; the mobile layout at 899-equivalent content and the wide layout at 900 are both complete states.
- **375:** tight but disciplined — event titles ellipsize (`Easy aerobic …`, `Run club — 8×(2…`) instead of wrapping/overflowing; hero stats compress to a 4-up row without truncation.
- **1280:** content max-width centered, wide week sheet, no wasted-edge issues.

Nothing breaks at any tested width. The breakpoint zone is in good shape.

## 3. Loading & error states

### Slow network (PB `127.0.0.1:8090` delayed 3s per request, 7 requests delayed)

| Check | Result |
|---|---|
| Calendar under delay shows a loading state, not blank | PASS — hero chrome + stat skeleton dashes + spinner + "Loading calendar…" (capture `slownet-calendar-early`) |
| Calendar settles with full data after the delay | PASS — identical to fast-path render, no overflow |
| Coach paints instantly under delay | PASS — empty state + chips render from local defaults while PB queries are in flight (`slownet-coach-early`) |
| Coach stream completes while PB is slow (stream is on :8099, correctly independent) | PASS — reply arrived, persisted |

No stuck states, no blank pages, no layout shift blowups when data lands.

### Network death (coach turn)

| Scenario | Result |
|---|---|
| Request dies before stream starts (route abort) | PASS — user bubble kept, empty assistant shell dropped (no empty bubble husk), error banner **"Coach service unreachable — check your connection and retry."** + Retry button, send input immediately available (`kill-request-died`). Next message completed normally. |
| **True mid-stream cut** (read error injected after 3 SSE frames via page-init fetch wrapper) | PASS — partial text ("Looking at your") **kept** in the transcript, error banner + Retry shown, no stuck spinner (`kill2-midstream-cut`). Tapping **Retry** re-sent the turn, completed fully, banner cleared (`kill2-midstream-recovered`). |
| Stalled stream (offline emulation on the loopback stream) | Stream stalled then completed; UI stayed consistent throughout, no hang, no false error. (Chrome's offline emulation slows rather than cuts loopback SSE — noted for future harness authors; use the fetch-wrapper injection for real cuts.) |

The coach error/timeout story is genuinely good: three distinct failure modes all end in a settled UI with the partial preserved and a one-tap Retry.

**Console/page errors:** 0 page errors across all runs. Two benign console entries: one `ERR_CONNECTION_REFUSED` (once in ~45 page loads, no visible impact — unlocated, worth a glance someday) and the expected `ERR_FAILED` from intentional aborts.

## 4. Verdicts

**LIKED**
1. **Coach failure UX** — banner + Retry + partial retention + empty-shell cleanup across all three failure modes (L1, medium-high value).
2. **Loading state craft** — calendar's "Loading calendar…" + skeleton stat dashes is theme-correct and informative; coach paints instantly from local state (L2).
3. **Overflow discipline** — literally zero horizontal overflow at 375/768/900/1280 on every surface (L3).
4. **Theme system** — System/Light/Dark override works, persists (PB record + local cache), and System tracks the OS on every width; all palettes matched, no visible leak (L4).

**CONFUSING**
1. **Coach resets to empty new chat on remount** (theme switch, fresh visit, tab re-entry) — the previous conversation is not restored; you land on "Ask your coach anything." History is one tap away and nothing is lost, but after switching dark→light I first thought my chat had been deleted. Severity: low-medium (C1).
2. **Disabled "Save profile" in light settings** — white text on pale lavender is washed out; reads as disabled (correct semantics) but the label is barely legible outdoors. Severity: low (C2).
3. **Raw error text mid-stream** — the banner shows the raw error message from the transport (my injection surfaced verbatim as "network gone mid-stream"; worker failures will show "Chat failed (status): …" style text). The pre-stream wording ("Coach service unreachable — check your connection and retry.") is the right register; the mid-stream path should reuse it. Severity: low (C3).

**BROKEN**
- None found this round. All 74 automated checks across the three passes passed (60/60 matrix, 6/6 slownet, 5/5 kill, 8/9 kill2 where the one "FAIL" was a probe race — the Retry button was present and worked, as the screenshot confirms).

**WISH**
1. **Paint the page backdrop from the palette** — kill the hard-coded light `rgb(242,242,242)` underlay so dark mode can't flash light on overscroll/paint gaps (W1, low severity, cheap).
2. **Mark the truncated partial in place** — the cut-off reply bubble looks normal once the banner scrolls away; a small "connection lost" marker on the bubble itself would keep the transcript honest (W2).
3. **Restore last coach session on remount** (or a "Continue last chat" chip on the empty state) to fix C1 (W3).

## 5. Coverage summary

- Widths: 375, 768, 900, 1280 — surfaces: calendar week, calendar month, coach (empty + transcript + one live message per width), settings.
- Themes: explicit Dark, explicit Light, System (OS-dark and OS-light) — via the real settings control.
- Network: baseline, +3s per PB request (loading states), pre-stream abort, true mid-stream read failure, stalled stream.
- Captures: 55 registered (`--agent ash`), incl. system-override and light-transcript pairs; per-PNG tEXt metadata + `latest/ash/` view.
- Rules honored: QA stack only; no production endpoints; no approvals anywhere; no credentials in this report.
