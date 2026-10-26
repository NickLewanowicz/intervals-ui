import { describe, expect, it } from 'vitest';
import { diffBarRow } from '../diff-bar-view';

const MINUS = '−'; // U+2212, same constant the module renders

describe('diffBarRow', () => {
  it('cut: minus chips + was/now captions', () => {
    const row = diffBarRow('distance', 8000, 5000)!;
    expect(row.label).toBe('Distance');
    expect(row.model.direction).toBe(-1);
    expect(row.pctChip).toBe(`${MINUS}37%`); // Math.round(-37.5) → -37
    expect(row.deltaChip).toBe(`${MINUS}3.0km`);
    expect(row.wasLabel).toBe('8.0km');
    expect(row.nowLabel).toBe('5.0km');
  });

  it('add: plus chips, direction 1', () => {
    const row = diffBarRow('duration', 1800, 2700)!;
    expect(row.model.direction).toBe(1);
    expect(row.deltaChip).toBe('+15m');
    expect(row.pctChip).toBe('+50%');
    expect(row.wasLabel).toBe('30m');
    expect(row.nowLabel).toBe('45m');
  });

  it('added from nothing: full-solid copy, no percent chip, "was —"', () => {
    const row = diffBarRow('distance', null, 6400)!;
    expect(row.model.direction).toBe(1);
    expect(row.deltaChip).toBe('+6.4km');
    expect(row.pctChip).toBeNull();
    expect(row.wasLabel).toBe('—');
    expect(row.nowLabel).toBe('6.4km');
  });

  it('removed to nothing: full-ghost copy, no percent chip, "now —"', () => {
    const row = diffBarRow('duration', 3600, null)!;
    expect(row.model.direction).toBe(-1);
    expect(row.deltaChip).toBe(`${MINUS}1h00m`);
    expect(row.pctChip).toBeNull();
    expect(row.wasLabel).toBe('1h00m');
    expect(row.nowLabel).toBe('—');
  });

  it('unchanged → no chips (row would not render)', () => {
    const row = diffBarRow('distance', 5000, 5000)!;
    expect(row.model.direction).toBe(0);
    expect(row.deltaChip).toBeNull();
    expect(row.pctChip).toBeNull();
  });

  it('sub-minute duration delta keeps second granularity', () => {
    expect(diffBarRow('duration', 2400, 2430)!.deltaChip).toBe('+30s');
    expect(diffBarRow('duration', 2400, 2310)!.deltaChip).toBe(`${MINUS}1m30s`);
  });

  it('duration captions match the scalar diff formatting', () => {
    const row = diffBarRow('duration', 2400, 3300)!;
    expect(row.wasLabel).toBe('40m');
    expect(row.nowLabel).toBe('55m');
  });

  it('unset on both sides → null (nothing to draw)', () => {
    expect(diffBarRow('distance', null, null)).toBeNull();
    expect(diffBarRow('distance', 0, undefined)).toBeNull();
  });
});
