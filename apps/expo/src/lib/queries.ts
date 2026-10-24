/**
 * React Query hooks over the PB mirrors + worker. All PB list reads filter by
 * the signed-in user's id; the SDK URL-encodes the filter string.
 */
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import { listProposals, type SyncResult } from './api';
import { currentUserId, pb } from './pb';
import { toActivity, toEvent, toWellness, type Proposal } from './records';

export const queryKeys = {
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  wellness: (days: number) => ['wellness', days] as const,
  syncState: ['sync-state'] as const,
  chatMessages: (sessionId: string) => ['chat-messages', sessionId] as const,
  pendingProposals: ['pending-proposals'] as const,
};

export interface CalendarWindow {
  events: EventEx[];
  activities: Activity[];
}

/** Events + activities whose start_date_local falls in [from, to] (ISO dates). */
export function useCalendarWindow(from: string, to: string): UseQueryResult<CalendarWindow> {
  return useQuery({
    queryKey: queryKeys.calendar(from, to),
    enabled: !!currentUserId(),
    queryFn: async (): Promise<CalendarWindow> => {
      const user = currentUserId();
      if (!user) return { events: [], activities: [] };
      const filter =
        `user = "${user}" && ` +
        `start_date_local >= "${from}T00:00:00" && ` +
        `start_date_local <= "${to}T23:59:59"`;
      const [ev, ac] = await Promise.all([
        pb.collection('calendar_events').getList(1, 300, { filter, sort: 'start_date_local' }),
        pb.collection('activities').getList(1, 300, { filter, sort: 'start_date_local' }),
      ]);
      return { events: ev.items.map(toEvent), activities: ac.items.map(toActivity) };
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
        .getList(1, days, { filter: `user = "${user}"`, sort: '-date' });
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
        .getList(1, 1, { filter: `user = "${user}"`, sort: '-updated' });
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
}

export function useChatMessages(sessionId: string | null): UseQueryResult<ChatMessageRow[]> {
  return useQuery({
    queryKey: queryKeys.chatMessages(sessionId ?? 'none'),
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatMessageRow[]> => {
      if (!sessionId) return [];
      const res = await pb
        .collection('chat_messages')
        .getList(1, 100, { filter: `session = "${sessionId}"`, sort: 'created' });
      return res.items.map((r) => ({
        id: r.id,
        role: r.role === 'assistant' ? 'assistant' : 'user',
        content: String(r.content ?? ''),
        created: String(r.created ?? ''),
      }));
    },
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
