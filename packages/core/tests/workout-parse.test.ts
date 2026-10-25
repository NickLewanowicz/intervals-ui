import { describe, expect, it } from 'vitest';
import {
  flattenWorkoutSpec,
  parseWorkoutDescription,
  timelineWeights,
} from '../src/workout-parse';

describe('parseWorkoutDescription', () => {
  it('parses the canonical section + steps form', () => {
    const spec = parseWorkoutDescription(
      'Warmup\n- 3km Z2 Pace\n\nMain Set 3x\n- 5m Z4 Pace\n- easy jog 2m Z1 Pace\n\nCooldown\n- 2km Z1 Pace',
    );
    expect(spec.sections).toHaveLength(3);
    const [warm, main, cool] = spec.sections;
    expect(warm!.name).toBe('Warmup');
    expect(warm!.steps[0]).toMatchObject({ distanceM: 3000, zoneStart: 2, zoneEnd: 2, unit: 'pace' });
    expect(main!.reps).toBe(3);
    expect(main!.steps[0]).toMatchObject({ durationS: 300, zoneStart: 4, unit: 'pace' });
    expect(main!.steps[1]).toMatchObject({ durationS: 120, zoneStart: 1, label: 'easy jog' });
    expect(cool!.steps[0]?.distanceM).toBe(2000);
    // totals expanded by reps: 3000 + (300m? no—) 3*(5m+2m)=1260s + 2000m
    expect(spec.totalDurationS).toBe(1260);
    expect(spec.totalDistanceM).toBe(5000);
    expect(spec.notes).toHaveLength(0);
  });

  it('parses live-athlete forms: ranges, lowercase, HR units, labels', () => {
    const spec = parseWorkoutDescription(
      '- Easy 1.5km Z1-Z2 HR\n- 3km Z2-Z3 Pace\n- Easy 1.5km Z1-Z2 HR',
    );
    expect(spec.sections).toHaveLength(1);
    const steps = spec.sections[0]!.steps;
    expect(steps[0]).toMatchObject({ distanceM: 1500, zoneStart: 1, zoneEnd: 2, unit: 'hr', label: 'Easy' });
    expect(steps[1]).toMatchObject({ distanceM: 3000, zoneStart: 2, zoneEnd: 3, unit: 'pace' });
    expect(spec.totalDistanceM).toBe(6000);
  });

  it('handles lowercase compact steps like "- 4km z2 hr"', () => {
    const spec = parseWorkoutDescription('- 4km z2 hr');
    expect(spec.sections[0]!.steps[0]).toMatchObject({
      distanceM: 4000,
      zoneStart: 2,
      unit: 'hr',
    });
  });

  it('parses seconds and minutes', () => {
    const spec = parseWorkoutDescription('Strides 6x\n- 15s Z5 Pace\n- 40s Z1 Pace');
    const steps = spec.sections[0]!.steps;
    expect(steps[0]!.durationS).toBe(15);
    expect(steps[1]!.durationS).toBe(40);
    expect(spec.sections[0]!.reps).toBe(6);
  });

  it('keeps prose as notes and still renders steps mixed with notes', () => {
    const spec = parseWorkoutDescription(
      '- 4km z2 hr\n\nRace rhythm day — 10 days out. Middle 3km @ 4:55/km (goal MP).\n📋 Physio: keep runs easy + flat.',
    );
    expect(spec.sections).toHaveLength(1);
    expect(spec.sections[0]!.steps).toHaveLength(1);
    expect(spec.notes).toHaveLength(2);
    expect(spec.notes[0]).toContain('4:55/km');
  });

  it('treats unlabeled step lists under a synthetic Workout section', () => {
    const spec = parseWorkoutDescription('- 10m Z2');
    expect(spec.sections[0]!.name).toBe('Workout');
    expect(spec.sections[0]!.steps[0]).toMatchObject({ durationS: 600, zoneStart: 2 });
  });

  it('zone without unit resolves no unit but keeps zone color info', () => {
    const spec = parseWorkoutDescription('- 10m Z3');
    const step = spec.sections[0]!.steps[0]!;
    expect(step).toMatchObject({ zoneStart: 3, durationS: 600 });
    expect(step.unit).toBeUndefined();
  });

  it('flattens with reps and weights by distance when uniform', () => {
    const spec = parseWorkoutDescription('Warmup\n- 2km Z1 Pace\nMain Set 2x\n- 1km Z4 Pace\n- 1km Z2 Pace');
    const flat = flattenWorkoutSpec(spec);
    expect(flat).toHaveLength(3);
    expect(flat[1]!.reps).toBe(2);
    const { metric, weights } = timelineWeights(flat);
    expect(metric).toBe('distance');
    expect(weights).toEqual([2000, 2000, 2000]);
  });

  it('weights by time when distances are missing', () => {
    const spec = parseWorkoutDescription('Main Set\n- 5m Z4 Pace\n- 2m Z1 HR');
    const { metric, weights } = timelineWeights(flattenWorkoutSpec(spec));
    expect(metric).toBe('time');
    expect(weights).toEqual([300, 120]);
  });

  it('gives metric-less steps a visible fallback slice', () => {
    const spec = parseWorkoutDescription('Main Set\n- 5m Z4 Pace\n- drills');
    const { weights } = timelineWeights(flattenWorkoutSpec(spec));
    expect(weights[1]).toBe(60); // fallback slice
  });
});
