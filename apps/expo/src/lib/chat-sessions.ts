/**
 * Multi-session chat bookkeeping, pure (unit tested) — the list logic behind
 * /coach/sessions (docs/research/chat-ui-patterns.md §1): order by LAST
 * ACTIVITY (never creation, never PB's `updated` — a rename/pin must not
 * reorder), pinned chats group on top, time groups Today / Yesterday /
 * Previous 7 / Older, and titles truncate at a word boundary.
 */

export interface ChatSessionMeta {
  id: string;
  title: string;
  pinned: boolean;
  /** ISO timestamp of the last message bump ('' when the row predates the field). */
  lastActivity: string;
  /** ISO creation timestamp (PB autodate). */
  created: string;
}

export type SessionGroupKey = 'pinned' | 'today' | 'yesterday' | 'previous7' | 'older';

/** The session's sort key: last activity, falling back to creation. ISO strings compare lexicographically. */
export function activityKey(s: ChatSessionMeta): string {
  return s.lastActivity || s.created || '';
}

/** Pinned first, then most-recent-activity first. Stable, pure. */
export function sortSessions(rows: ChatSessionMeta[]): ChatSessionMeta[] {
  return [...rows].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return activityKey(b).localeCompare(activityKey(a));
  });
}

/** Local calendar day number of an ISO timestamp (UTC-anchored on the date part the device would show). */
function localDayNumber(d: Date): number {
  return Math.floor(
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400_000,
  );
}

function dayNumberFromISO(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : localDayNumber(new Date(t));
}

export interface SessionGroup<T = ChatSessionMeta> {
  key: SessionGroupKey;
  label: string;
  sessions: T[];
}

/**
 * Group sessions for the list: pinned on top (regardless of age — the pin IS
 * its group), then Today / Yesterday / Previous 7 Days / Older by local
 * calendar day of last activity. Empty groups are omitted; within a group the
 * input order is preserved (callers pass sortSessions output). Generic: rows
 * may carry extra fields (e.g. the demo flag) through untouched.
 */
export function groupSessions<T extends ChatSessionMeta>(rows: T[], now: Date = new Date()): SessionGroup<T>[] {
  const todayNum = localDayNumber(now);
  const groups = new Map<SessionGroupKey, T[]>();
  for (const s of rows) {
    if (s.pinned) {
      push(groups, 'pinned', s);
      continue;
    }
    const dayNum = dayNumberFromISO(activityKey(s));
    if (dayNum == null) {
      push(groups, 'older', s);
      continue;
    }
    const age = todayNum - dayNum;
    if (age <= 0) push(groups, 'today', s);
    else if (age === 1) push(groups, 'yesterday', s);
    else if (age <= 7) push(groups, 'previous7', s);
    else push(groups, 'older', s);
  }
  const LABELS: Record<SessionGroupKey, string> = {
    pinned: 'PINNED',
    today: 'TODAY',
    yesterday: 'YESTERDAY',
    previous7: 'PREVIOUS 7 DAYS',
    older: 'OLDER',
  };
  const order: SessionGroupKey[] = ['pinned', 'today', 'yesterday', 'previous7', 'older'];
  return order
    .filter((k) => (groups.get(k)?.length ?? 0) > 0)
    .map((k) => ({ key: k, label: LABELS[k], sessions: groups.get(k)! }));
}

function push<T>(map: Map<SessionGroupKey, T[]>, key: SessionGroupKey, s: T) {
  const list = map.get(key);
  if (list) list.push(s);
  else map.set(key, [s]);
}

/**
 * Compact relative activity label for a session row:
 *   <1 min  → "now" · today → "9:14" · 1-6 days → "2d" · 7-27 days → "3w"
 *   older   → "Oct 12" · unparsable/blank → "" (renderer hides it).
 */
export function relativeActivityLabel(iso: string, now: Date = new Date()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const then = new Date(t);
  const ageDays = localDayNumber(now) - localDayNumber(then);
  if (ageDays <= 0) {
    const diffMs = now.getTime() - t;
    if (diffMs < 60_000) return 'now';
    const hh = String(then.getHours()).padStart(2, '0');
    const mm = String(then.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  if (ageDays <= 6) return `${ageDays}d`;
  if (ageDays <= 27) return `${Math.floor(ageDays / 7)}w`;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[then.getMonth()]} ${then.getDate()}`;
}

/**
 * Session title from the user's first message: collapsed whitespace,
 * truncated at a WORD BOUNDARY near 48 chars (round-10: `slice(0, 60)` cut
 * mid-word — "Tell me about my long run paces f…").
 */
export function titleFromMessage(message: string, max = 48): string {
  const collapsed = (message ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const slice = collapsed.slice(0, max);
  const cut = slice.lastIndexOf(' ');
  const base = cut > max * 0.5 ? slice.slice(0, cut) : slice;
  return `${base.replace(/[,;:.\s]+$/, '')}…`;
}

// ---------- inline proposal cards (transcript attribution) ----------

/** Minimal message shape the transcript attribution needs. */
export interface TurnRef {
  id: string;
  role: 'user' | 'assistant';
  /** ISO persist stamp; in-memory (streaming) bubbles have none. */
  created?: string;
}

/**
 * Map each proposal to the assistant turn that produced it, for the inline
 * card row under the bubble (LobeChat plugin-card pattern). Persisted
 * proposals ride their turn (latest assistant stamp at-or-before the
 * proposal's); a proposal newer than everything persisted rides the live
 * (streaming) bubble; unstamped proposals always do. Result: bubble id →
 * proposal ids, insertion-ordered.
 */
export function attachProposals(
  turns: TurnRef[],
  proposals: Array<{ id: string; created?: string }>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const lastAssistant = [...turns].reverse().find((t) => t.role === 'assistant');
  const liveAssistant =
    lastAssistant && !lastAssistant.created ? lastAssistant : undefined; // streaming bubble
  const assistantStamps = turns.filter((t) => t.role === 'assistant' && t.created);
  const lastStamp = assistantStamps.length ? assistantStamps[assistantStamps.length - 1]!.created : undefined;
  for (const p of proposals) {
    let target: TurnRef | undefined;
    const stamp = p.created;
    if (stamp && lastStamp && stamp > lastStamp && liveAssistant) {
      // produced during the turn in flight — newer than everything persisted
      target = liveAssistant;
    } else if (stamp && lastStamp) {
      // latest persisted assistant turn at (or before) the proposal's stamp
      target = assistantStamps.filter((t) => t.created! <= stamp).at(-1) ?? lastAssistant;
    } else {
      // no stamps at all (live transcript) or no stamp on the proposal:
      // the producing turn is the last assistant bubble
      target = lastAssistant;
    }
    if (!target) continue;
    (out[target.id] ??= []).push(p.id);
  }
  return out;
}
