/**
 * React Query hooks over the PB mirrors + worker. All PB list reads filter by
 * the signed-in user's id; the SDK URL-encodes the filter string.
 */
import { useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
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
import { addDays, todayISO } from './dates';
import { currentUserId, pb } from './pb';
import { toActivity, toEvent, toWellness, type Proposal } from './records';
import {
  WIDGET_SNAPSHOT_STALE_MS,
  WIDGET_UPCOMING_PAST_DAYS,
  WIDGET_WRITE_DEBOUNCE_MS,
  buildWidgetSnapshot,
  readWidgetSnapshot,
  writeWidgetSnapshot,
  type WidgetSnapshotInput,
} from './widget-data';
import { writeIosWidgetSnapshot } from './widget-ios';

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
  widgetSnapshotSource: ['widget-snapshot-source'] as const,
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
 * to the requested range, plus the moment that cache was actually fetched.
 * Undefined when nothing covers it — the query then loads as usual.
 */
function cachedContainingWindow(
  qc: QueryClient,
  from: string,
  to: string,
): { data: CalendarWindow; updatedAt: number } | undefined {
  const entries = qc.getQueriesData<CalendarWindow>({ queryKey: ['calendar'] });
  let best: { from: string; to: string; data: CalendarWindow; updatedAt: number } | undefined;
  for (const [key, data] of entries) {
    if (!data) continue;
    const f = key[1];
    const t = key[2];
    if (typeof f !== 'string' || typeof t !== 'string') continue;
    if (f > from || t < to) continue; // must fully contain the requested window
    if (!best || (f >= best.from && t <= best.to)) {
      best = {
        from: f,
        to: t,
        data,
        updatedAt: qc.getQueryState(key)?.dataUpdatedAt ?? 0,
      };
    }
  }
  if (!best) return undefined;
  return {
    updatedAt: best.updatedAt,
    data: {
      events: best.data.events.filter((e) => inWindow(e.start_date_local, from, to)),
      activities: best.data.activities.filter((a) => inWindow(a.start_date_local, from, to)),
    },
  };
}

/**
 * Events + activities whose start_date_local falls in [from, to] (ISO dates).
 * Seeds from any cached containing window via initialData so a day pushed from
 * the calendar renders INSTANTLY with known info — and, because the seed
 * carries the cache's true fetch time (initialDataUpdatedAt), a stale seed is
 * treated as stale: the query resolves FROM THE MIRROR in the background
 * instead of trusting the slice for staleTime (QA A3 cold deep-link fix).
 */
export function useCalendarWindow(from: string, to: string): UseQueryResult<CalendarWindow> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.calendar(from, to),
    enabled: !!currentUserId(),
    initialData: () => cachedContainingWindow(qc, from, to)?.data,
    initialDataUpdatedAt: () => cachedContainingWindow(qc, from, to)?.updatedAt,
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
        created: typeof r.created === 'string' ? r.created : null,
        bundleKey: typeof r.bundle_key === 'string' && r.bundle_key !== '' ? r.bundle_key : null,
        bundleSummary:
          typeof r.bundle_summary === 'string' && r.bundle_summary !== '' ? r.bundle_summary : null,
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
    // round-16: a manual sync should reach the home-screen widgets too
    void qc.invalidateQueries({ queryKey: queryKeys.widgetSnapshotSource });
    if (result) void qc.refetchQueries({ queryKey: ['calendar'] });
  };
}

// ---------- widget snapshot sync (round 16) ----------

/**
 * The widget snapshot source: the SAME mirror reads the calendar uses, over a
 * window wide enough for both widgets — events/activities [today−2d, +90d]
 * (the sync window, so far-future races reach the countdown AND done/missed
 * states survive snapshots written before the activity synced) and 14
 * wellness days.
 */
async function fetchWidgetSnapshotSource(): Promise<WidgetSnapshotInput> {
  const user = currentUserId();
  if (!user) throw new Error('not signed in');
  const today = todayISO();
  const filter = calendarWindowFilter(user, addDays(today, -WIDGET_UPCOMING_PAST_DAYS), addDays(today, 90));
  const [ev, ac, wl] = await Promise.all([
    pb.collection('calendar_events').getList(1, 300, { filter, sort: 'start_date_local' }),
    pb.collection('activities').getList(1, 300, { filter, sort: 'start_date_local' }),
    pb.collection('wellness').getList(1, 14, { filter: wellnessFilter(user), sort: '-date' }),
  ]);
  return {
    events: ev.items.map(toEvent),
    activities: ac.items.map(toActivity),
    wellness: wl.items.map(toWellness),
  };
}

/**
 * Push the freshly-written snapshot onto every PLACED widget. A snapshot
 * write alone never reaches the launcher — the lib's requestWidgetUpdate
 * re-renders each registered widget from the new snapshot (no-op per widget
 * when it isn't on a home screen).
 */
async function refreshPlacedWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // require keeps the native-only graph out of the web evaluation path (index.ts)
  const { requestWidgetUpdate } =
    require('react-native-android-widget') as typeof import('react-native-android-widget');
  const widgets = require('../../widgets') as typeof import('../../widgets');
  const snapshot = await readWidgetSnapshot();
  await Promise.all(
    widgets.WIDGET_NAMES.map((name) =>
      requestWidgetUpdate({
        widgetName: name,
        renderWidget: (info) => {
          const element = widgets.renderWidgetByName(name, info.width, info.height, snapshot);
          // WIDGET_NAMES only contains registered components, so element is set
          return Promise.resolve(element!) as Promise<import('react-native-android-widget').WidgetRepresentation>;
        },
      }).catch(() => undefined), // not placed / launcher refused — fine
    ),
  );
}

/**
 * Fire-and-forget home-screen widget snapshot refresh (round 16 Android,
 * round 17 iOS WidgetKit).
 *
 * Mount once on the calendar screen: when the widget source query succeeds,
 * a debounced write lands in AsyncStorage (see widget-data.ts) and placed
 * widgets re-render — the UI is never blocked on it. Android pushes through
 * requestWidgetUpdate; iOS additionally mirrors the JSON into the App Group
 * via the WidgetSnapshotBridge native module (see widget-ios.ts), which calls
 * WidgetCenter.reloadAllTimelines() on the same write. On app foreground the
 * snapshot is checked and the source refetched only when missing or older
 * than 6h (background JS cannot run; the OS-level widget timeline refresh
 * also re-renders from the last snapshot). Web is a no-op.
 */
export function useWidgetSnapshotSync(): void {
  const qc = useQueryClient();
  const android = Platform.OS === 'android';
  const ios = Platform.OS === 'ios';
  const nativeWidgets = android || ios;
  const signedIn = !!currentUserId();

  const source = useQuery({
    queryKey: queryKeys.widgetSnapshotSource,
    enabled: nativeWidgets && signedIn,
    staleTime: 15 * 60_000,
    retry: false,
    queryFn: fetchWidgetSnapshotSource,
  });

  // debounced, non-blocking write + widget push whenever fresh mirror data lands
  useEffect(() => {
    if (!nativeWidgets || !source.data) return;
    const t = setTimeout(() => {
      writeWidgetSnapshot(source.data!)
        .then(async () => {
          // round-17: mirror the same snapshot into the iOS App Group
          if (ios) writeIosWidgetSnapshot(buildWidgetSnapshot(source.data!));
        })
        .then(() => (android ? refreshPlacedWidgets() : undefined))
        .catch((e: unknown) => console.warn('[widget] snapshot refresh failed:', e));
    }, WIDGET_WRITE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [android, ios, nativeWidgets, source.data]);

  // foreground: refresh only when the snapshot went stale (>6h)
  useEffect(() => {
    if (!nativeWidgets) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !currentUserId()) return;
      void (async () => {
        const snap = await readWidgetSnapshot();
        const fresh = snap != null && Date.now() - snap.writtenAt < WIDGET_SNAPSHOT_STALE_MS;
        if (!fresh) qc.invalidateQueries({ queryKey: queryKeys.widgetSnapshotSource });
      })();
    });
    return () => sub.remove();
  }, [nativeWidgets, qc]);
}
