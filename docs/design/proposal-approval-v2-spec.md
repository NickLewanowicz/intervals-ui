# Proposal Approval v2 — spec (visual diffs, coach-first layout, bundles)

Author: orchestrator (vision session), 2026-10-25. From the owner's review of
the approval modal (screenshot: "Update Aerobic maintenance"). Verbatim intent:
visual proportional change bars (not numbers-to-compare); the coach's summary
belongs at the TOP with the coach avatar; the raw description block with "…"
concatenation is unreadable; show zone-over-time comparison for current vs
proposed; and when the coach makes 2-3 related changes for ONE holistic
reason, they must be reviewed TOGETHER with multi-select — not three
accept-accept-accept rounds with the same reason repeated.

## 1. ProposalModal v3 layout (single proposal)

Order top → bottom:
1. **Coach summary strip** (NEW, first thing): coach avatar (existing asset)
   + the proposal's `rationale` as ONE readable sentence (wrap, no italics
   needed), preceded by nothing else. This is the "why" — it must be read
   first. Kind + name title stays (compact, right of avatar block).
2. **Visual metric diffs** for distance and duration (NEW `DiffBar`
   primitive):
   - One horizontal track per metric. Scale = max(old, new). Draw old value
     as a filled bar; the delta as a second segment: REMOVED portion =
     hatched/dashed ghost bar in red tones with a "−2.4km" chip; ADDED
     portion = solid green segment appended with a "+2.4km" chip. Percent
     chip next to the label ("−27%").
   - Up/down semantics: more volume = green (add), less = red (cut) — with
     the coach's rationale giving it meaning (a cut is often the GOOD change;
     the verdict stays in the summary, the color only encodes direction).
   - If a metric exists only on one side: full ghost (removed) or full solid
     (added), labeled "was —" / "now —".
   - Pure model in packages/core (`diffBar(oldV, newV) →
     {scale, oldFrac, newFrac, deltaPct, direction}`) + tests.
3. **Zone-over-time comparison** (both timelines, stacked, shared x-scale):
   CURRENT timeline bar above, PROPOSED below (both already exist as
   WorkoutTimeline compact bars — reuse; same metric + width so they're
   visually comparable). Where the parse fails for either side, fall back to
   the raw text COLLAPSED behind a "View workout text" disclosure (default
   closed — the "…" concatenation never shows by default).
4. **Name diff** stays (it signals the workout type change) — small, under
   the title: "Aerobic maintenance → Aerobic maintenance 6km".
5. **Actions**: Approve / Dismiss unchanged. Helper line unchanged.

Remove: the old italic rationale block at the bottom (moved to top), the
always-open raw description text (collapsed), the "event #id" line (keep as
tiny muted metadata at the very bottom).

## 2. Bundled proposals (multi-select review)

**Coach surface (prompt v5 + tool schema):** every propose tool gains an
optional arg `bundle: { summary: string }` (short shared label, e.g. "Rebuild
week — cutting easy volume"). When 2+ changes serve ONE holistic reason, the
coach includes the SAME `bundle.summary` on each call and makes the per-item
rationale the item-specific part ("cut from 9km to 6km") while the week-level
reason lives in the shared summary. Single unrelated changes omit it.
Proposals created with the same `bundle.summary` in the same session are
grouped client-side by that key.

**Schema (tools/pb_setup.mjs):** proposals gains `bundle_key` (text) +
`bundle_summary` (text). Worker stores them from the validated tool args
(strip from the EventEx payload before apply — they are NOT intervals fields).

**Approval UI:** pending proposals that share a bundle_key render as ONE
"Bundled changes" sheet:
- Header: bundle summary as the title + item count ("3 changes · Rebuild
  week — cutting easy volume").
- The shared rationale once (coach summary strip, same as single).
- Each item = collapsible row: checkbox (default ALL CHECKED) + proposalTitle
  + its DiffBars + expand → full ProposalModal-v3 content (timelines etc.).
- Footer: "Approve selected (n)" + "Dismiss all". Approve applies selected
  sequentially via the new batch endpoint; per-item results reported
  (applied/failed chips). Dismiss-all dismisses the bundle in one action.
- Individually-created proposals keep today's single-modal flow.

**Worker:** `POST /api/proposals/apply-batch { ids: string[] }` (owner-scoped,
validates each belongs to caller, applies sequentially, returns per-id
results; stops at first hard failure but reports all). `dismiss-batch`
similar. Single-item endpoints unchanged.

## 3. Cleanup riding along

- Description pipe artifacts ("| |" from the digest) are already normalized
  at parse time; ALSO normalize before storing payload descriptions at
  proposal-creation (worker + local-chat) so raw text never shows pipes.
- The truncated "volume capp…" preview line dies with the collapsed
  disclosure.

## Acceptance

- Modal v3: rationale strip first; DiffBars visible for distance/duration
  changes; timelines compared; raw text collapsed; no "…" concatenation
  visible by default.
- Bundle: a coach reply proposing 2-3 related changes produces ONE grouped
  review; multi-select approve applies exactly the checked items; dismiss-all
  clears the bundle; single proposals unchanged.
- Both transports (direct + worker), both platforms; parity checked by
  qa-parity; evals: new fixtures prove the coach emits bundle summaries when
  trimming multiple sessions (and omits them for single changes); all
  existing fixtures stay green.
