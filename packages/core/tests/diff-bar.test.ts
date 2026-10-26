import { describe, expect, it } from 'vitest';
import { diffBar } from '../src/diff-bar';

describe('diffBar', () => {
  it('shortening: old filled, removed segment negative/red', () => {
    const d = diffBar(9_000, 6_000)!;
    expect(d.scale).toBe(9000);
    expect(d.oldFrac).toBeCloseTo(1, 5);
    expect(d.newFrac).toBeCloseTo(2 / 3, 4);
    expect(d.direction).toBe(-1);
    expect(d.deltaFrac).toBeCloseTo(-1 / 3, 4);
    expect(d.deltaPct).toBe(-33);
  });

  it('lengthening: added segment positive/green', () => {
    const d = diffBar(6_000, 9_000)!;
    expect(d.direction).toBe(1);
    expect(d.deltaFrac).toBeCloseTo(1 / 3, 4);
    expect(d.deltaPct).toBe(50);
  });

  it('added-from-nothing: full green, no percent', () => {
    const d = diffBar(null, 6_000)!;
    expect(d!.direction).toBe(1);
    expect(d!.oldFrac).toBe(0);
    expect(d!.newFrac).toBe(1);
    expect(d!.deltaPct).toBeNull();
  });

  it('removed-to-nothing: full ghost', () => {
    const d = diffBar(9_000, null)!;
    expect(d!.direction).toBe(-1);
    expect(d!.oldFrac).toBe(1);
    expect(d!.newFrac).toBe(0);
  });

  it('unchanged values → direction 0', () => {
    expect(diffBar(6000, 6000)!.direction).toBe(0);
  });

  it('null when neither side has a usable value', () => {
    expect(diffBar(null, null)).toBeNull();
    expect(diffBar(0, 0)).toBeNull();
  });
});
