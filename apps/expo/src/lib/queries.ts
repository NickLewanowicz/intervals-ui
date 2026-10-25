/**
 * React Query hooks over the PB mirrors + worker. All PB list reads filter by
 * the signed-in user's id; the SDK URL-encodes the filter string.
 */
import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { Activity, EventEx, SportSettings, WellnessDay } from '@intervals/core';
import { listProposals, type SyncResult } from './api';
import {
  calendarWindowFilter,
  chatMessagesFilter,
  chatSessionsFilter,
  intervalsIdFilter,
  sessionProposalsFilter,
  sportSettingsFilter,
  syncStateFilter,
  wellnessFilter,
} from './filters';
import { currentUserId, pb } from './pb';
import { toActivity, toEvent, toWellness, type Proposal } from './records';

export const queryKeys = {
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  wellness: (days: number) => ['wellness', days] as const,
  syncState: ['sync-state'] as const,
  chatSessions: ['chat-sessions'] as const,
  chatMessages: (sessionId: string) => ['chat-messages', sessionId] as const,
  sessionProposals: (sessionId: string) => ['session-proposals', sessionId] as const,
  pendingProposals: ['pending-proposals'] as const,
  mirroredEvent: (intervalsId: number) => ['mirrored-event', intervalsId] as const,
  thresholdPace: ['threshold-pace'] as const,
};

export interface CalendarWindow {
  events: EventEx[];
  activities: Activity[];
}

const inWindow = (dateLocal: string, from: string, to: string) => {
  const d = dateLocal.slice(0, 10);
  return d >= from && d <= to;
};

/**
 * The tightest already-cached calendar window that fully contains [from, to]
 * (e.g. the calendar screen's week window seeding a pushed day screen), sliced
 * to the requested range. Undefined when nothing covers it — the query then
 * loads as usual.
 */
function cachedContainingWindow(qc: QueryClient, from: string, to: string): CalendarWindow | undefined {
  const entries = qc.getQueriesData<CalendarWindow>({ queryKey: ['calendar'] });
  let best: { from: string; to: string; data: CalendarWindow } | undefined;
  for (const [key, data] of entries) {
    if (!data) continue;
    const f = key[1];
    const t = key[2];
    if (typeof f !== 'string' || typeof t !== 'string') continue;
    if (f > from || t < to) continue; // must fully contain the requested window
    if (!best || (f >= best.from && t <= best.to)) best = { from: f, to: t, data };
  }
  if (!best) return undefined;
  return {
    events: best.data.events.filter((e) => inWindow(e.start_date_local, from, to)),
    activities: best.data.activities.filter((a) => inWindow(a.start_date_local, from, to)),
  };
}

/**
 * Events + activities whose start_date_local falls in [from, to] (ISO dates).
 * Seeds from any cached containing window via initialData so a day pushed from
 * the calendar renders INSTANTLY with known info and only refines in the
 * background — no spinner when the data is already on hand.
 */
export function useCalendarWindow(from: string, to: string): UseQueryResult<CalendarWindow> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.calendar(from, to),
    enabled: !!currentUserId(),
    initialData: () => cachedContainingWindow(qc, from, to),
    queryFn: async (): Promise<CalendarWindow> => {
      const user = currentUserId();
      if (!user) return { events: [], activities: [] };
      const filter = calendarWindowFilter(user, from, to);
      const [ev, ac] = await Promise.all([
        pb.collection('calendar_events').getList(1, 300, { filter, sort: 'start_date_local' }),
        pb.collection('activities').getList(1, 300, { filter, sort: 'start_date_local' }),
      ]);
      return { events: ev.items.map(toEvent), activities: ac.items.map(toActivity) };
    },
  });
}

/**
 * The athlete's threshold pace (min/km) from the mirrored sport settings —
 * the fallback estimator input when the window has no usable recent pace.
 */
export function useThresholdPace(): UseQueryResult<number | null> {
  return useQuery({
    queryKey: queryKeys.thresholdPace,
    enabled: !!currentUserId(),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<number | null> => {
      const user = currentUserId();
      if (!user) return null;
      const res = await pb
        .collection('sport_settings')
        .getList(1, 1, { filter: sportSettingsFilter(user) });
      const row = res.items[0];
      const raw: unknown = row?.data;
      const list: SportSettings[] = Array.isArray(raw) ? (raw as SportSettings[]) : raw ? [raw as SportSettings] : [];
      for (const s of list) {
        if (s && typeof s.threshold_pace === 'number' && s.threshold_pace > 0) return s.threshold_pace;
      }
      return null;
    },
  });
}

/** Most recent `days` wellness rows (newest first). */
export function useWellness(days = 14): UseQueryResult<WellnessDay[]> {
  return useQuery({
    queryKey: queryKeys.wellness(days),
    enabled: !!currentUserId(),
    queryFn: async (): Promise<WellnessDay[]> => {
      const user = currentUserId();
      if (!user) return [];
      const res = await pb
        .collection('wellness')
        .getList(1, days, { filter: wellnessFilter(user), sort: '-date' });
      return res.items.map(toWellness);
    },
  });
}

export interface SyncStateRow {
  status: string;
  error: string | null;
  lastSync: string | null;
}

export function useSyncState(): UseQueryResult<SyncStateRow | null> {
  return useQuery({
    queryKey: queryKeys.syncState,
    enabled: !!currentUserId(),
    queryFn: async (): Promise<SyncStateRow | null> => {
      const user = currentUserId();
      if (!user) return null;
      const res = await pb
        .collection('sync_state')
        .getList(1, 1, { filter: syncStateFilter(user), sort: '-updated' });
      const row = res.items[0];
      if (!row) return null;
      return {
        status: String(row.status ?? ''),
        error: row.error ? String(row.error) : null,
        lastSync: row.last_sync ? String(row.last_sync) : null,
      };
    },
  });
}

export interface ChatMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created: string;
  /** tool-call-only turn (persisted with empty content) — renders the anchor + cards */
  toolOnly: boolean;
}

export function useChatMessages(sessionId: string | null): UseQueryResult<ChatMessageRow[]> {
  return useQuery({
    queryKey: queryKeys.chatMessages(sessionId ?? 'none'),
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatMessageRow[]> => {
      if (!sessionId) return [];
      const res = await pb
        .collection('chat_messages')
        .getList(1, 100, { filter: chatMessagesFilter(sessionId), sort: 'created' });
      return res.items.map((r) => {
        const toolCalls = Array.isArray(r.tool_calls) ? r.tool_calls : [];
        return {
          id: r.id,
          role: r.role === 'assistant' ? 'assistant' : 'user',
          content: String(r.content ?? ''),
          created: String(r.created ?? ''),
          toolOnly: r.role === 'assistant' && !String(r.content ?? '') && toolCalls.length > 0,
        };
      });
    },
  });
}

// ---------- chat sessions (round-10 multi-session) ----------

export interface ChatSessionRow {
  id: string;
  title: string;
  pinned: boolean;
  /** ISO last-activity stamp ('' when the row predates the field). */
  lastMessageAt: string;
  created: string;
}

/** All of the user's chat sessions (list screen sorts/groups client-side). */
export function useChatSessions(): UseQueryResult<ChatSessionRow[]> {
  return useQuery({
    queryKey: queryKeys.chatSessions,
    enabled: !!currentUserId(),
    queryFn: async (): Promise<ChatSessionRow[]> => {
      const user = currentUserId();
      if (!user) return [];
      const res = await pb
        .collection('chat_sessions')
        .getList(1, 100, { filter: chatSessionsFilter(user), sort: '-created' });
      return res.items.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? 'Untitled chat'),
        pinned: r.pinned === true,
        lastMessageAt: String(r.last_message_at ?? ''),
        created: String(r.created ?? ''),
      }));
    },
  });
}

/** Owner-scoped session mutations (updateRule allows owner updates). */
export async function renameChatSession(id: string, title: string): Promise<void> {
  await pb.collection('chat_sessions').update(id, { title });
}

export async function setChatSessionPinned(id: string, pinned: boolean): Promise<void> {
  await pb.collection('chat_sessions').update(id, { pinned });
}

export async function deleteChatSession(id: string): Promise<void> {
  await pb.collection('chat_sessions').delete(id); // cascade deletes the session's messages
}

/** Invalidate everything a session mutation could have changed. */
export function useInvalidateChatData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['chat-sessions'] });
    void qc.invalidateQueries({ queryKey: ['chat-messages'] });
    void qc.invalidateQueries({ queryKey: ['session-proposals'] });
  };
}

/**
 * Every proposal produced in one session, any status — the inline transcript
 * cards (LobeChat plugin-card pattern). Statuses refresh via invalidation
 * after a modal resolution.
 */
export function useSessionProposals(sessionId: string | null): UseQueryResult<Proposal[]> {
  return useQuery({
    queryKey: queryKeys.sessionProposals(sessionId ?? 'none'),
    enabled: !!sessionId,
    queryFn: async (): Promise<Proposal[]> => {
      if (!sessionId) return [];
      const res = await pb
        .collection('proposals')
        .getList(1, 50, { filter: sessionProposalsFilter(sessionId), sort: '-created' });
      return res.items.map((r) => ({
        id: String(r.id),
        kind: (r.kind as Proposal['kind']) ?? 'create_event',
        payload: (r.payload ?? {}) as EventEx,
        rationale: typeof r.rationale === 'string' ? r.rationale : null,
        status: typeof r.status === 'string' ? r.status : 'pending',
      }));
    },
  });
}

/**
 * The mirror's current state of one upstream event — the "before" side of an
 * update/delete proposal diff (persona finding #1). Null when the event is
 * not in the mirror (the modal must never block approval on that).
 */
export function useMirroredEvent(intervalsId: number | null | undefined): UseQueryResult<EventEx | null> {
  return useQuery({
    queryKey: queryKeys.mirroredEvent(intervalsId ?? 0),
    enabled: !!currentUserId() && intervalsId != null,
    queryFn: async (): Promise<EventEx | null> => {
      const user = currentUserId();
      if (!user || intervalsId == null) return null;
      const res = await pb
        .collection('calendar_events')
        .getList(1, 1, { filter: intervalsIdFilter(user, intervalsId) });
      const row = res.items[0];
      return row ? toEvent(row) : null;
    },
    staleTime: 30_000, // mirror state is stable while a proposal is being read
  });
}

/** Pending proposals (via the worker, which owns proposal resolution). */
export function usePendingProposals(): UseQueryResult<Proposal[]> {
  return useQuery({
    queryKey: queryKeys.pendingProposals,
    enabled: !!currentUserId(),
    queryFn: () => listProposals('pending'),
    retry: false, // worker may be down; the UI shows its own error state
  });
}

/** Invalidate everything a sync (or applied proposal) could have changed. */
export function useInvalidateMirrors() {
  const qc = useQueryClient();
  return (result?: SyncResult) => {
    void qc.invalidateQueries({ queryKey: ['calendar'] });
    void qc.invalidateQueries({ queryKey: ['wellness'] });
    void qc.invalidateQueries({ queryKey: queryKeys.syncState });
    if (result) void qc.refetchQueries({ queryKey: ['calendar'] });
  };
}
