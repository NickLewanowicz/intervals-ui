import { describe, expect, it } from 'vitest';
import {
  MAX_BAR_SEGMENTS,
  MAX_LEGEND_ROWS,
  formatStepDuration,
  normalizeDescription,
  planTimeline,
  stepQuantity,
  stepTarget,
  workoutSummaryLine,
} from '../workout-view';
import { parseWorkoutDescription } from '@intervals/core';

const TEMPO = [
  'Warmup',
  '- 2km Z1 Pace',
  'Main Set 4x',
  '- 5min Z4 Pace',
  '- 90s Z1 Pace',
  'Cooldown',
  '- 2km Z1 Pace',
].join('\n');

describe('formatStepDuration', () => {
  it('keeps sub-minute steps honest (formatDuration would floor 15s to 1m)', () => {
    expect(formatStepDuration(15)).toBe('15s');
    expect(formatStepDuration(59)).toBe('59s');
  });

  it('shows minutes with seconds when they matter', () => {
    expect(formatStepDuration(90)).toBe('1m30s');
    expect(formatStepDuration(300)).toBe('5m');
  });

  it('delegates hour+ spans to core formatDuration', () => {
    expect(formatStepDuration(3600)).toBe('1h00m');
    expect(formatStepDuration(5400)).toBe('1h30m');
  });
});

describe('stepQuantity / stepTarget', () => {
  it('distance step: km quantity + zone/unit target', () => {
    const [step] = parseWorkoutDescription('- 3km Z2 Pace').sections[0]!.steps;
    expect(stepQuantity(step!)).toBe('3.0km');
    expect(stepTarget(step!)).toBe('Z2 Pace');
  });

  it('duration step: seconds-precision quantity', () => {
    const [step] = parseWorkoutDescription('- 15s Z5 Pace').sections[0]!.steps;
    expect(stepQuantity(step!)).toBe('15s');
    expect(stepTarget(step!)).toBe('Z5 Pace');
  });

  it('range + HR unit reads "Z1-Z2 HR"', () => {
    const [step] = parseWorkoutDescription('- Easy 1.5km Z1-Z2 HR').sections[0]!.steps;
    expect(stepQuantity(step!)).toBe('1.5km');
    expect(stepTarget(step!)).toBe('Z1-Z2 HR');
  });

  it('unquantifiable step has neither', () => {
    const [step] = parseWorkoutDescription('- Steady effort').sections[0]!.steps;
    expect(stepQuantity(step!)).toBeNull();
    expect(stepTarget(step!)).toBeNull();
  });
});

describe('planTimeline', () => {
  it('returns null for prose-only or empty descriptions', () => {
    expect(planTimeline('Easy double today, legs off the bike.')).toBeNull();
    expect(planTimeline('')).toBeNull();
    expect(planTimeline(undefined as unknown as string)).toBeNull();
  });

  it('sizes the tempo run by time and repeats rep steps (4x on/off visible)', () => {
    const plan = planTimeline(TEMPO)!;
    expect(plan).not.toBeNull();
    expect(plan.metric).toBe('time'); // 5min/90s steps have no distance
    // warmup, 4x (Z4 + Z1 jog), cooldown → 10 segments
    expect(plan.segments.map((s) => s.zoneStart)).toEqual([1, 4, 1, 4, 1, 4, 1, 4, 1, 1]);
    // Z4 work dominates the bar (1200s of 1680s), warmup/cooldown keep filler slices
    const z4 = plan.segments.filter((s) => s.zoneStart === 4);
    expect(z4).toHaveLength(4);
    for (const seg of z4) expect(seg.weight).toBe(300);
    expect(plan.totalsLabel).toBe('4.0km · 26m'); // km warmup/cooldown + 4x(5min+90s)
  });

  it('groups legend rows under section headers with the reps badge data', () => {
    const plan = planTimeline(TEMPO)!;
    expect(plan.groups.map((g) => [g.section, g.reps])).toEqual([
      ['Warmup', undefined],
      ['Main Set', 4],
      ['Cooldown', undefined],
    ]);
    const [warmupRow] = plan.groups[0]!.rows;
    expect(warmupRow!.quantity).toBe('2.0km');
    expect(warmupRow!.target).toBe('Z1 Pace');
    const [workRow, jogRow] = plan.groups[1]!.rows;
    expect(workRow!.quantity).toBe('5m');
    expect(jogRow!.quantity).toBe('1m30s');
  });

  it('collapses reps beyond the bar-segment cap instead of exploding', () => {
    const lines = ['Main Set 15x', '- 1min Z4 Pace', '- 30s Z1 Pace'];
    const plan = planTimeline(lines.join('\n'))!;
    // 30 expanded segments > cap → one segment per unique step
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0]!.weight).toBe(60 * 15);
    expect(plan.segments[1]!.weight).toBe(30 * 15);
  });

  it('uses distance as the metric only when every step has one', () => {
    const plan = planTimeline(['Warmup', '- 2km Z1 Pace', '- 3km Z2 Pace'].join('\n'))!;
    expect(plan.metric).toBe('distance');
    expect(plan.totalsLabel).toBe('5.0km');
    expect(plan.segments.map((s) => s.weight)).toEqual([2000, 3000]);
  });

  it('marks undetectable zones (0) so they render muted, not as a fake zone', () => {
    const plan = planTimeline(['- Steady 10min'].join('\n'))!;
    expect(plan.segments[0]!.zoneStart).toBe(0);
    expect(plan.groups[0]!.rows[0]!.label).toBe('Steady');
    expect(plan.groups[0]!.rows[0]!.target).toBeNull();
  });

  it('caps the legend and counts hidden rows', () => {
    const lines = ['Main Set', ...Array.from({ length: MAX_LEGEND_ROWS + 3 }, (_, i) => `- ${i + 1}min Z3 Pace`)];
    const plan = planTimeline(lines.join('\n'))!;
    expect(plan.groups[0]!.rows).toHaveLength(MAX_LEGEND_ROWS);
    expect(plan.hiddenRows).toBe(3);
  });

  it('surfaces parsed notes for the muted prose block', () => {
    const plan = planTimeline(['Easy spin tomorrow.', 'Warmup', '- 2km Z1 Pace'].join('\n'))!;
    expect(plan.notes).toEqual(['Easy spin tomorrow.']);
  });

  it('handles the single-step degenerate case with one full-width segment', () => {
    const plan = planTimeline('- 5km Z2 Pace')!;
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]!.weight).toBeGreaterThan(0);
    expect(plan.groups).toHaveLength(1);
  });
});

describe('normalizeDescription', () => {
  it('turns literal ⏎ stand-ins into newlines (seen live in a glm proposal)', () => {
    // exact payload stored 2026-10-24 — the model wrote U+23CE, not \n
    const live = 'Warmup ⏎ - 2km Z1-Z2 Pace ⏎  ⏎ Main Set 4x ⏎ - Hard 5m Z4 Pace ⏎ - easy jog 90s Z1 Pace ⏎  ⏎ Cooldown ⏎ - 2km Z1 Pace';
    const plan = planTimeline(live)!;
    expect(plan).not.toBeNull();
    expect(plan.groups.map((g) => g.section)).toEqual(['Warmup', 'Main Set', 'Cooldown']);
    expect(plan.groups[1]!.reps).toBe(4);
    expect(plan.segments.length).toBeGreaterThan(4);
  });

  it('also expands literal backslash-n sequences', () => {
    const plan = planTimeline('Warmup\\n- 2km Z1 Pace')!;
    expect(plan.groups).toHaveLength(1);
    expect(normalizeDescription('a\\nb')).toBe('a\nb');
  });

  it('leaves real newlines alone', () => {
    expect(normalizeDescription('Warmup\n- 2km Z1 Pace')).toBe('Warmup\n- 2km Z1 Pace');
  });

  it('the ⏎-collapsed summary still truncates, but now the blurb is the section line', () => {
    const live = 'Warmup ⏎ - 2km Z1-Z2 Pace ⏎ Cooldown ⏎ - 2km Z1 Pace';
    // normalized, this parses fully → no notes → summary falls back to line 1
    expect(workoutSummaryLine(live)).toBe('Warmup');
  });
});

describe('workoutSummaryLine', () => {
  it('prefers the first note line (race-week cues read like a blurb)', () => {
    const desc = ['Keep it relaxed — race is Sunday.', 'Warmup', '- 2km Z1 Pace'].join('\n');
    expect(workoutSummaryLine(desc)).toBe('Keep it relaxed — race is Sunday.');
  });

  it('falls back to the first non-empty line when everything parses', () => {
    expect(workoutSummaryLine(TEMPO)).toBe('Warmup');
  });

  it('truncates long lines with an ellipsis at the cap', () => {
    const long = 'x'.repeat(250);
    const out = workoutSummaryLine(long)!;
    expect(out.length).toBe(100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns null for empty descriptions', () => {
    expect(workoutSummaryLine('')).toBeNull();
    expect(workoutSummaryLine('   \n  ')).toBeNull();
  });
});

describe('normalizeDescription — digest pipe separators', () => {
  it('folds " | " back to newlines before step lines', () => {
    expect(
      normalizeDescription('Warmup | - 2km Z1 Pace | Main Set 4x | - 5m Z4 Pace'),
    ).toBe('Warmup\n- 2km Z1 Pace\nMain Set 4x\n- 5m Z4 Pace');
  });
  it('leaves pipes that are not line boundaries alone', () => {
    expect(normalizeDescription('Physio notes Tue | Thu, see https://x.co/a|b')).toBe(
      'Physio notes Tue | Thu, see https://x.co/a|b',
    );
  });
});
