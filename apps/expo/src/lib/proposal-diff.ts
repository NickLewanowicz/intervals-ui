/**
 * Before→after diff for update_event proposals (pure, unit tested) — persona
 * finding #1: the approval envelope showed only the new state, so the athlete
 * approved blind. Diff the mirror's current event against the payload and
 * render only what changes.
 */
import { formatDuration, formatKm } from '@intervals/core';
import type { EventEx } from '@intervals/core';

export type DiffKey = 'name' | 'when' | 'distance' | 'duration' | 'category' | 'type' | 'description';

export interface DiffRow {
  key: DiffKey;
  label: string;
  before: string | null;
  after: string | null;
  /** description rows render timelines instead of a single line */
  isWorkout: boolean;
}

export interface EventDiff {
  changed: DiffRow[];
  /** labels of fields that are set and identical (context line under the diff) */
  unchangedLabels: string[];
}

const FIELD_ORDER: DiffKey[] = ['name', 'when', 'distance', 'duration', 'category', 'type', 'description'];

const LABELS: Record<DiffKey, string> = {
  name: 'Name',
  when: 'When',
  distance: 'Distance',
  duration: 'Duration',
  category: 'Category',
  type: 'Sport',
  description: 'Workout',
};

/** null/undefined/'' all mean "unset" so a payload echo doesn't fake a change. */
function normText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

function normNum(v: number | null | undefined): number | null {
  // 0 = "not set" for distance/duration (time-based sessions carry 0)
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function formatValue(key: DiffKey, e: EventEx): string | null {
  switch (key) {
    case 'name':
      return normText(e.name);
    case 'when': {
      const s = normText(e.start_date_local);
      return s ? s.replace('T', ' · ') : null;
    }
    case 'distance': {
      const d = normNum(e.distance);
      return d != null ? formatKm(d) : null;
    }
    case 'duration': {
      const t = normNum(e.moving_time);
      return t != null ? formatDuration(t) : null;
    }
    case 'category':
      return normText(e.category);
    case 'type':
      return normText(e.type);
    case 'description':
      return normText(e.description);
  }
}

/**
 * Diff `before` (mirror state, may be null = not found) against the payload
 * `after`. Rows in stable display order; unchanged fields collapse into
 * `unchangedLabels`. `before == null` → every set field of `after` is "new".
 *
 * An update payload OMITS fields it leaves alone (the worker applies it as a
 * partial patch), so "unset in payload but set in mirror" counts as
 * unchanged — never as a removal.
 */
export function diffEvent(before: EventEx | null | undefined, after: EventEx): EventDiff {
  const changed: DiffRow[] = [];
  const unchangedLabels: string[] = [];
  for (const key of FIELD_ORDER) {
    const b = before ? formatValue(key, before) : null;
    const a = formatValue(key, after);
    if (a == null && b == null) continue; // unset on both sides — not a field
    if (a == null) {
      // payload omits it: patch semantics keep the mirror value
      if (b != null) unchangedLabels.push(LABELS[key]);
      continue;
    }
    if (b === a) {
      if (a != null) unchangedLabels.push(LABELS[key]);
      continue;
    }
    changed.push({ key, label: LABELS[key], before: b, after: a, isWorkout: key === 'description' });
  }
  return { changed, unchangedLabels };
}

/** "Update Recovery jog" / "Add Tempo run" / "Delete Easy aerobic" — never a
 * raw DB id in the headline (persona finding #1b). Falls back to the old
 * verbs when no human name is available. */
export function proposalTitle(
  kind: 'create_event' | 'update_event' | 'delete_event',
  name: string | null | undefined,
): string {
  const verb = kind === 'create_event' ? 'Add' : kind === 'update_event' ? 'Update' : 'Delete';
  const n = normText(name);
  return n ? `${verb} ${n}` : kind === 'create_event' ? 'Add to calendar' : `${verb} calendar entry`;
}
