import { describe, expect, it } from 'vitest';
import { diffEvent, proposalTitle } from '../proposal-diff';
import type { EventEx } from '@intervals/core';

const BEFORE: EventEx = {
  id: 147702969,
  start_date_local: '2026-10-24T06:00:00',
  category: 'WORKOUT',
  type: 'Run',
  name: 'Recovery jog',
  description: 'Easy\n- 5km Z1 Pace',
  distance: 5000,
  moving_time: 2400,
};

describe('diffEvent', () => {
  it('identical event → no changes, unchanged labels listed', () => {
    const { changed, unchangedLabels } = diffEvent(BEFORE, { ...BEFORE });
    expect(changed).toEqual([]);
    expect(unchangedLabels).toEqual(['Name', 'When', 'Distance', 'Duration', 'Category', 'Sport', 'Workout']);
  });

  it('distance + duration change renders old → new', () => {
    const { changed } = diffEvent(BEFORE, { ...BEFORE, distance: 8000, moving_time: 3300 });
    expect(changed).toEqual([
      { key: 'distance', label: 'Distance', before: '5.0km', after: '8.0km', isWorkout: false },
      { key: 'duration', label: 'Duration', before: '40m', after: '55m', isWorkout: false },
    ]);
  });

  it('name and date changes format the when cell', () => {
    const { changed } = diffEvent(BEFORE, {
      ...BEFORE,
      name: 'Recovery jog (flat)',
      start_date_local: '2026-10-25T08:30:00',
    });
    expect(changed.map((r) => [r.key, r.before, r.after])).toEqual([
      ['name', 'Recovery jog', 'Recovery jog (flat)'],
      ['when', '2026-10-24 · 06:00:00', '2026-10-25 · 08:30:00'],
    ]);
  });

  it('description change is flagged isWorkout with raw text both sides', () => {
    const next = 'Easy\n- 8km Z1 Pace';
    const { changed } = diffEvent(BEFORE, { ...BEFORE, description: next });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ key: 'description', label: 'Workout', isWorkout: true });
    expect(changed[0]!.before).toContain('5km');
    expect(changed[0]!.after).toBe(next);
  });

  it('category change (e.g. promoted to RACE_A) diffs', () => {
    const { changed } = diffEvent(BEFORE, { ...BEFORE, category: 'RACE_A' });
    expect(changed).toEqual([
      { key: 'category', label: 'Category', before: 'WORKOUT', after: 'RACE_A', isWorkout: false },
    ]);
  });

  it('unset→set counts as a change', () => {
    const noDesc: EventEx = { ...BEFORE, description: undefined };
    expect(diffEvent(noDesc, { ...BEFORE }).changed.map((r) => r.key)).toEqual(['description']);
  });

  it('payload-omitted fields are unchanged (partial-patch semantics), never "→ —"', () => {
    const partial: EventEx = {
      id: BEFORE.id,
      start_date_local: '2026-10-24T06:00:00',
      name: 'Easy 8km',
      distance: 8000,
    };
    const { changed, unchangedLabels } = diffEvent(BEFORE, partial);
    expect(changed.map((r) => [r.key, r.before, r.after])).toEqual([
      ['name', 'Recovery jog', 'Easy 8km'],
      ['distance', '5.0km', '8.0km'],
    ]);
    expect(unchangedLabels).toContain('When');
    expect(unchangedLabels).toContain('Category');
    expect(unchangedLabels).toContain('Workout');
    expect(changed.every((r) => r.after !== null)).toBe(true);
  });

  it('empty-string payload fields do not fake changes (echo noise)', () => {
    const padded = `  ${BEFORE.description}  `;
    const { changed } = diffEvent(BEFORE, {
      ...BEFORE,
      description: padded,
      name: 'Recovery jog ',
    });
    expect(changed).toEqual([]);
  });

  it('before == null (not in mirror) → every set field is new', () => {
    const { changed, unchangedLabels } = diffEvent(null, BEFORE);
    expect(changed.map((r) => r.key)).toEqual([
      'name',
      'when',
      'distance',
      'duration',
      'category',
      'type',
      'description',
    ]);
    expect(unchangedLabels).toEqual([]);
    expect(changed.every((r) => r.before === null)).toBe(true);
  });

  it('zero distance/duration in the mirror means "not set" (time-based session)', () => {
    const timeBased: EventEx = { ...BEFORE, distance: 0, moving_time: 1800 };
    const { changed } = diffEvent(timeBased, { ...timeBased, distance: 8000 });
    expect(changed).toEqual([
      { key: 'distance', label: 'Distance', before: null, after: '8.0km', isWorkout: false },
    ]);
  });

  it('rows stay in stable display order regardless of change set', () => {
    const { changed } = diffEvent(BEFORE, {
      ...BEFORE,
      name: 'X',
      description: 'y',
      type: 'Ride',
      moving_time: 1,
    });
    expect(changed.map((r) => r.key)).toEqual(['name', 'duration', 'type', 'description']);
  });
});

describe('proposalTitle', () => {
  it('intent + current name, never the raw id', () => {
    expect(proposalTitle('update_event', 'Recovery jog')).toBe('Update Recovery jog');
    expect(proposalTitle('create_event', 'Tempo run')).toBe('Add Tempo run');
    expect(proposalTitle('delete_event', 'Easy aerobic')).toBe('Delete Easy aerobic');
  });

  it('falls back to the old verbs without a name', () => {
    expect(proposalTitle('update_event', null)).toBe('Update calendar entry');
    expect(proposalTitle('create_event', undefined)).toBe('Add to calendar');
    expect(proposalTitle('delete_event', '')).toBe('Delete calendar entry');
  });
});
