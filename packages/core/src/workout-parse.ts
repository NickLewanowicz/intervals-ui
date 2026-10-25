/**
 * Parse intervals.icu workout descriptions (the free-text the coach writes and
 * intervals.icu parses server-side) into a structured spec for timeline
 * rendering. Grammar verified against live athlete data + the official forum
 * (docs/research/intervals-api-brief.md §4):
 *
 *   Warmup                      ← section line (optional "Main Set 4x" count)
 *   - 1.5km Z2 Pace             ← step: distance + zone + unit
 *   - 15s Z5 Pace               ← step: duration (s/m/min) + zone
 *   - Easy 1.5km Z1-Z2 HR       ← label prefix + zone RANGE + unit (any case)
 *   Main Set 4x
 *   - Steady 1m Z3 Pace         ← steps repeat per section count
 *   Cooldown
 *   - 2km Z1 Pace
 *   Free prose lines            ← notes (rendered as text, not timeline)
 *
 * Tolerant by design: lowercase zones ("z2 hr"), ranges ("Z1-2"), missing
 * units, labels before/after the quantity. Steps we can't quantify still
 * render (as text steps with their zone color when detectable).
 */

export interface WorkoutStepSpec {
  /** Free-text label ("Easy", "Steady", "Progressive") when present. */
  label?: string;
  distanceM?: number;
  durationS?: number;
  zoneStart?: number; // 1..7 (SS→6.5-ish mapped by caller if needed)
  zoneEnd?: number;
  unit?: 'pace' | 'hr' | 'power';
  raw: string;
}

export interface WorkoutSectionSpec {
  name: string;
  reps?: number;
  steps: WorkoutStepSpec[];
}

export interface WorkoutSpec {
  sections: WorkoutSectionSpec[];
  notes: string[];
  /** Summed distance/duration across all steps (expanded by reps). */
  totalDistanceM?: number;
  totalDurationS?: number;
}

const SECTION_RE = /^(?!-\s)([A-Za-z][A-Za-z0-9 '’&/().-]*?)(?:\s+(\d+)\s*[xX])?\s*$/;
const ZONE_RE = /z\s*(\d)\s*(?:-\s*z?\s*(\d))?/i;
const UNIT_RE = /\b(pace|hr|heart\s*rate|watts?|power)\b/i;
const QTY_RE =
  /(\d+(?:\.\d+)?)\s*(km|k|m|min(?:s|utes?)?|s|sec(?:onds?)?|h(?:rs?|ours?)?)\b/i;
const LABEL_RE = /^-\s*(.+)$/;

export function parseWorkoutDescription(description: string): WorkoutSpec {
  const sections: WorkoutSectionSpec[] = [];
  const notes: string[] = [];
  let current: WorkoutSectionSpec | null = null;

  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!line.startsWith('-')) {
      const sectionMatch = SECTION_RE.exec(line);
      // A plain line with a reps count is a section even if wordy
      // ("Main Set 4x"); prose without counts is a note.
      if (sectionMatch && (sectionMatch[2] || isSectionish(line))) {
        current = {
          name: (sectionMatch[1] || line).trim(),
          reps: sectionMatch[2] ? Number(sectionMatch[2]) : undefined,
          steps: [],
        };
        sections.push(current);
      } else if (line.length <= 200) {
        notes.push(line);
      }
      continue;
    }

    // Step line
    const body = LABEL_RE.exec(line)?.[1] ?? line.slice(1).trim();
    const step: WorkoutStepSpec = { raw: body };
    const zone = ZONE_RE.exec(body);
    if (zone) {
      step.zoneStart = Number(zone[1]);
      step.zoneEnd = zone[2] ? Number(zone[2]) : step.zoneStart;
    }
    const unit = UNIT_RE.exec(body);
    if (unit) {
      const u = (unit[1] ?? '').toLowerCase();
      step.unit = u.startsWith('w') || u === 'power' ? 'power' : u === 'pace' ? 'pace' : 'hr';
    }
    const qty = QTY_RE.exec(body);
    if (qty) {
      const value = Number(qty[1]);
      const kind = qty[2]!.toLowerCase();
      if (kind === 'km' || kind === 'k') step.distanceM = value * 1000;
      else if (kind === 'm') {
        // ambiguous: bare "m" after a number in step context = minutes
        // (distances are written km/k; "- 200m" sprints are rare — treat
        // integer 3-digit+ values as meters? live data uses km for distance,
        // m for minutes. Prefer minutes; "- 200m sprint" still renders fine
        // because we keep the raw text.)
        step.durationS = value * 60;
      } else if (kind === 'min' || kind.startsWith('min')) step.durationS = value * 60;
      else if (kind === 's' || kind.startsWith('sec')) step.durationS = value;
      else if (kind === 'h' || kind.startsWith('h')) step.durationS = value * 3600;
    }
    // Label = body minus the quantity/zone/unit tokens we extracted
    const label = body
      .replace(QTY_RE, ' ')
      .replace(ZONE_RE, ' ')
      .replace(UNIT_RE, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*[-–]\s*$/, '')
      .trim();
    if (label && !/^\d+$/.test(label)) step.label = label;

    if (!current) {
      current = { name: 'Workout', steps: [] };
      sections.push(current);
    }
    current.steps.push(step);
  }

  // totals, expanding section reps
  let totalDistanceM: number | undefined;
  let totalDurationS: number | undefined;
  for (const s of sections) {
    const reps = s.reps ?? 1;
    for (const st of s.steps) {
      if (st.distanceM != null) totalDistanceM = (totalDistanceM ?? 0) + st.distanceM * reps;
      if (st.durationS != null) totalDurationS = (totalDurationS ?? 0) + st.durationS * reps;
    }
  }

  return {
    sections,
    notes,
    ...(totalDistanceM != null ? { totalDistanceM } : {}),
    ...(totalDurationS != null ? { totalDurationS } : {}),
  };
}

/** Heuristic: lines like "Warmup", "Main Set", "Cooldown", "Race" → sections. */
function isSectionish(line: string): boolean {
  return /^(warm\s*up|warmup|cool\s*down|cooldown|main\s*set|set|recovery|race|strides|drills|finish|tester|primer|activation)\b/i.test(
    line,
  );
}

/** Flat, reps-expanded step list for timeline rendering. */
export function flattenWorkoutSpec(spec: WorkoutSpec): Array<
  WorkoutStepSpec & { section: string; reps: number }
> {
  const out: Array<WorkoutStepSpec & { section: string; reps: number }> = [];
  for (const s of spec.sections) {
    const reps = s.reps ?? 1;
    for (const st of s.steps) out.push({ ...st, section: s.name, reps });
  }
  return out;
}

/**
 * Timeline weights per step (meters when all steps have distance, else
 * seconds). Steps missing the dominant metric get a small default slice so
 * they stay visible.
 */
export function timelineWeights(
  steps: Array<WorkoutStepSpec & { reps: number }>,
): { metric: 'distance' | 'time'; weights: number[] } {
  const withDistance = steps.filter((s) => s.distanceM != null).length;
  const metric: 'distance' | 'time' = withDistance === steps.length ? 'distance' : 'time';
  const FALLBACK = 60; // seconds, or 60m if nobody has distance — visual filler
  const weights = steps.map((s) => {
    const v = metric === 'distance' ? s.distanceM : s.durationS;
    const base = typeof v === 'number' && v > 0 ? v : FALLBACK;
    return base * s.reps;
  });
  return { metric, weights };
}
