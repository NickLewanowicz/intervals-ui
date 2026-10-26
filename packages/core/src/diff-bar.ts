/**
 * Visual model for the approval modal's metric diff bars (proposal-approval
 * v2): one shared scale = max(|old|, |new|); the old value renders filled,
 * the delta renders as a removed (hatched/red) or added (solid/green)
 * segment. Pure + tested; the screen maps fractions to widths and colors.
 */

export interface DiffBarModel {
  /** max(old, new) — both bars share this scale. */
  scale: number;
  oldFrac: number; // 0..1 — filled portion representing the old value
  newFrac: number; // 0..1 — filled portion representing the new value
  /** Direction relative to old: 1 added, -1 removed, 0 unchanged/unknown. */
  direction: 1 | -1 | 0;
  /** Signed fractional change ((new-old)/scale) — segment to highlight. */
  deltaFrac: number; // -1..1
  deltaPct: number | null; // e.g. -33 for a 9→6km cut; null when old=0/absent
}

export function diffBar(
  oldV: number | null | undefined,
  newV: number | null | undefined,
): DiffBarModel | null {
  const o = typeof oldV === 'number' && Number.isFinite(oldV) && oldV > 0 ? oldV : null;
  const n = typeof newV === 'number' && Number.isFinite(newV) && newV > 0 ? newV : null;
  if (o == null && n == null) return null;
  const scale = Math.max(o ?? 0, n ?? 0);
  if (scale <= 0) return null;
  const oldFrac = (o ?? 0) / scale;
  const newFrac = (n ?? 0) / scale;
  const direction: 1 | -1 | 0 =
    o == null && n != null ? 1 : n == null && o != null ? -1 : n === o ? 0 : n! > o! ? 1 : -1;
  const deltaFrac = newFrac - oldFrac;
  const deltaPct = o && o > 0 && n != null ? Math.round(((n - o) / o) * 100) : null;
  return { scale, oldFrac, newFrac, direction, deltaFrac, deltaPct };
}
