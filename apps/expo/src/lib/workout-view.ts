/**
 * View-model for the WorkoutTimeline (pure, unit tested). Sits on top of
 * @intervals/core's description parser: turns a WorkoutSpec into bar segments
 * + legend rows, and builds the one-line summary the proposal modal shows
 * above the visual ("text blurb describing it briefly" per V-05).
 */
import {
  flattenWorkoutSpec,
  formatDuration,
  formatKm,
  parseWorkoutDescription,
  timelineWeights,
  type WorkoutStepSpec,
} from '@intervals/core';

/** Bar segments beyond this collapse back to one-per-step (no ×N repeats). */
export const MAX_BAR_SEGMENTS = 20;
/** Legend rows shown before a "+N more" line. */
export const MAX_LEGEND_ROWS = 12;
/** Summary-line cap (the modal's brief blurb). */
export const SUMMARY_MAX_CHARS = 100;

/** One colored slice of the timeline bar. zoneStart 0 = undetectable → muted. */
export interface TimelineSegment {
  key: string;
  zoneStart: number; // 1..7
  zoneEnd: number; // 1..7 (ranges color by zoneEnd)
  /** Relative width; reps-expanded when the bar repeats a step. */
  weight: number;
}

export interface TimelineRow {
  key: string;
  zoneStart: number;
  zoneEnd: number;
  /** Free-text label ("Easy", "Steady") — or the raw step when unquantified. */
  label: string;
  quantity: string | null; // "1.5km" / "90s"
  target: string | null; // "Z2 Pace" / "Z1-Z2 HR"
}

export interface TimelineGroup {
  section: string;
  reps?: number;
  rows: TimelineRow[];
}

export interface TimelinePlan {
  metric: 'distance' | 'time';
  /** Parsed totals across reps, e.g. "12.0km" or "1h05m" — null when unknowable. */
  totalsLabel: string | null;
  segments: TimelineSegment[];
  groups: TimelineGroup[];
  /** Legend rows hidden by the cap (renders "+N more steps"). */
  hiddenRows: number;
  notes: string[];
}

const UNIT_LABEL = { pace: 'Pace', hr: 'HR', power: 'Power' } as const;

/**
 * Coach models occasionally emit literal newline stand-ins ("⏎" U+23CE or a
 * backslash-n) instead of real newlines, which collapses the section grammar
 * into one line. Seen live 2026-10-24 (glm tempo proposal). Normalize before
 * parsing so the timeline still renders; the raw text surface keeps the
 * original untouched.
 */
export function normalizeDescription(description: string): string {
  return (description ?? '')
    .replace(/\s*⏎\s*/g, '\n')
    .replace(/\\n/g, '\n')
    // the coach digest joins description lines with " | " — models copy that
    // verbatim into update payloads, so fold it back to newlines, but only at
    // line boundaries (before "- " steps or section words) so prose pipes and
    // URLs survive
    .replace(/\s*\|\s*(?=-\s)/g, '\n')
    .replace(/\s*\|\s*(?=(warm\s*up|warmup|cool\s*down|cooldown|main\s*set|strides|drills|race)\b)/gi, '\n');
}

function zoneOf(step: WorkoutStepSpec): { start: number; end: number } {
  if (step.zoneStart == null) return { start: 0, end: 0 };
  return { start: step.zoneStart, end: step.zoneEnd ?? step.zoneStart };
}

/**
 * Step duration at human granularity — formatDuration floors to minutes
 * ("15s" → "1m"), which lies about stride/recovery steps.
 */
export function formatStepDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (s < 3600) return rem ? `${m}m${rem}s` : `${m}m`;
  return formatDuration(s);
}

/** "1.5km" / "90s" — the step's quantity, null when neither is parseable. */
export function stepQuantity(step: WorkoutStepSpec): string | null {
  if (step.distanceM != null) return formatKm(step.distanceM);
  if (step.durationS != null) return formatStepDuration(step.durationS);
  return null;
}

/** "Z2 Pace" / "Z1-Z2 HR" — the step's zone target, null without a zone. */
export function stepTarget(step: WorkoutStepSpec): string | null {
  if (step.zoneStart == null) return null;
  const zone =
    step.zoneEnd != null && step.zoneEnd !== step.zoneStart
      ? `Z${step.zoneStart}-Z${step.zoneEnd}`
      : `Z${step.zoneStart}`;
  return step.unit ? `${zone} ${UNIT_LABEL[step.unit]}` : zone;
}

function rowOf(step: WorkoutStepSpec, key: string): TimelineRow {
  const { start, end } = zoneOf(step);
  const quantity = stepQuantity(step);
  const target = stepTarget(step);
  const quantified = quantity != null || target != null;
  return {
    key,
    zoneStart: start,
    zoneEnd: end,
    label: quantified ? (step.label ?? '') : step.raw,
    quantity,
    target,
  };
}

/**
 * Full timeline plan from a description; null when nothing structured parses
 * (prose-only) so the caller keeps its plain text blurb.
 */
export function planTimeline(description: string): TimelinePlan | null {
  const spec = parseWorkoutDescription(normalizeDescription(description ?? ''));
  const steps = flattenWorkoutSpec(spec);
  if (steps.length === 0) return null;

  // Repeats read like intervals.icu's workout renderer when few — the bar
  // alternates work/recovery per rep cycle; beyond the cap, one segment per
  // unique step.
  const expandedCount = steps.reduce((n, st) => n + Math.max(st.reps, 1), 0);
  const repeat = expandedCount <= MAX_BAR_SEGMENTS;

  const { metric, weights } = timelineWeights(steps);
  const segments: TimelineSegment[] = [];
  const emit = (st: WorkoutStepSpec, weight: number, key: string) => {
    const { start, end } = zoneOf(st);
    segments.push({ key, zoneStart: start, zoneEnd: end, weight });
  };
  let flat = 0;
  for (const section of spec.sections) {
    const reps = Math.max(section.reps ?? 1, 1);
    if (repeat && reps > 1) {
      for (let r = 0; r < reps; r++) {
        section.steps.forEach((st, i) => emit(st, (weights[flat + i] ?? 0) / reps, `s${flat + i}r${r}`));
      }
    } else {
      section.steps.forEach((st, i) => emit(st, weights[flat + i] ?? 0, `s${flat + i}`));
    }
    flat += section.steps.length;
  }

  // Legend rows grouped by section, capped (long main sets must not bury the UI).
  const groups: TimelineGroup[] = [];
  let shown = 0;
  let hiddenRows = 0;
  for (const section of spec.sections) {
    if (section.steps.length === 0) continue;
    const rows = section.steps.map((st, i) => rowOf(st, `${section.name}-${i}`));
    const room = MAX_LEGEND_ROWS - shown;
    if (room <= 0) {
      hiddenRows += rows.length;
    } else if (rows.length <= room) {
      groups.push({ section: section.name, ...(section.reps != null ? { reps: section.reps } : {}), rows });
      shown += rows.length;
    } else {
      groups.push({ section: section.name, ...(section.reps != null ? { reps: section.reps } : {}), rows: rows.slice(0, room) });
      shown += room;
      hiddenRows += rows.length - room;
    }
  }

  const totals: string[] = [];
  if (spec.totalDistanceM != null) totals.push(formatKm(spec.totalDistanceM));
  if (spec.totalDurationS != null) totals.push(formatDuration(spec.totalDurationS));

  return {
    metric,
    totalsLabel: totals.length ? totals.join(' · ') : null,
    segments,
    groups,
    hiddenRows,
    notes: spec.notes,
  };
}

/**
 * The brief blurb: first parsed note line (race-week cues read naturally),
 * else the description's first non-empty line; capped with an ellipsis.
 */
export function workoutSummaryLine(description: string): string | null {
  const text = normalizeDescription(description ?? '').trim();
  if (!text) return null;
  const spec = parseWorkoutDescription(text);
  const firstLine =
    spec.notes[0] ?? text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const line = firstLine.trim();
  if (!line) return null;
  if (line.length <= SUMMARY_MAX_CHARS) return line;
  return `${line.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…`;
}
