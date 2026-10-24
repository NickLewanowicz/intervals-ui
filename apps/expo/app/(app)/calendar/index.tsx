/**
 * THE core screen. Week view (7 day cards, planned vs recorded) with a
 * monthly grid toggle, weekly stats strip, and manual sync.
 */
import { buildDayCells, isRaceEvent, weeklyStats, formatDuration, formatKm } from '@intervals/core';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { triggerSync } from '@/lib/api';
import {
  addDays,
  addMonths,
  dayLabel,
  isInMonth,
  monthAnchor,
  monthGrid,
  startOfWeek,
  todayISO,
  weekDates,
  weekRangeLabel,
  weekWindow,
} from '@/lib/dates';
import { activityLine, eventLine } from '@/lib/format';
import { useCalendarWindow, useInvalidateMirrors } from '@/lib/queries';
import { colors, fontSize, radius, spacing } from '@/theme';
import type { DayCell } from '@intervals/core';

export default function CalendarScreen() {
  const today = todayISO();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const [monthAnc, setMonthAnc] = useState(() => monthAnchor(todayISO()));

  const week = weekWindow(weekStart);
  const grid = useMemo(() => monthGrid(monthAnc), [monthAnc]);
  const window = view === 'week' ? week : { from: grid.from, to: grid.to };

  const { data, isLoading, isError, error, refetch } = useCalendarWindow(window.from, window.to);
  const invalidateMirrors = useInvalidateMirrors();

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const events = data?.events ?? [];
  const activities = data?.activities ?? [];
  const cells = useMemo(() => buildDayCells(events, activities), [events, activities]);
  const stats = useMemo(() => weeklyStats(events, activities, weekStart), [events, activities, weekStart]);

  const onSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await triggerSync();
      invalidateMirrors(r);
      setSyncMsg(`Synced ${r.events ?? 0} events · ${r.activities ?? 0} activities`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? `Sync failed: ${e.message}` : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const goDay = (date: string) => router.push({ pathname: '/calendar/day', params: { date } });

  return (
    <View style={styles.page}>
      {/* header: nav + view toggle + sync */}
      <View style={styles.header}>
        <View style={styles.navRow}>
          <Button
            title="‹"
            variant="ghost"
            onPress={() =>
              view === 'week'
                ? setWeekStart(addDays(weekStart, -7))
                : setMonthAnc(addMonths(monthAnc, -1))
            }
            style={styles.navBtn}
          />
          <Text style={styles.title}>{view === 'week' ? weekRangeLabel(weekStart) : grid.label}</Text>
          <Button
            title="›"
            variant="ghost"
            onPress={() =>
              view === 'week'
                ? setWeekStart(addDays(weekStart, 7))
                : setMonthAnc(addMonths(monthAnc, 1))
            }
            style={styles.navBtn}
          />
          <Button
            title="Today"
            variant="ghost"
            onPress={() => {
              setWeekStart(startOfWeek(today));
              setMonthAnc(monthAnchor(today));
            }}
          />
          <Button
            title={view === 'week' ? 'Month' : 'Week'}
            variant="ghost"
            onPress={() => setView(view === 'week' ? 'month' : 'week')}
          />
          <Button title={syncing ? 'Syncing…' : 'Sync now'} onPress={onSync} loading={syncing} />
        </View>
        {syncMsg ? <Text style={styles.syncMsg}>{syncMsg}</Text> : null}
      </View>

      {/* weekly stats strip */}
      <Card style={styles.statsCard}>
        <View style={styles.statsGrid}>
          <Stat label="Distance" planned={fmtKmOrDash(stats.plannedDistanceM)} actual={fmtKmOrDash(stats.actualDistanceM)} />
          <Stat label="Time" planned={stats.plannedTimeSec ? formatDuration(stats.plannedTimeSec) : '—'} actual={stats.actualTimeSec ? formatDuration(stats.actualTimeSec) : '—'} />
          <Stat label="Load" planned={stats.plannedLoad ? String(Math.round(stats.plannedLoad)) : '—'} actual={stats.actualLoad ? String(Math.round(stats.actualLoad)) : '—'} />
          <Stat label="Longest run" actual={stats.longestRunM ? formatKm(stats.longestRunM) : '—'} planned="—" hidePlanned />
        </View>
        <Text style={styles.statsHint}>
          planned vs actual · week of {weekRangeLabel(weekStart).split(' – ')[0]}
        </Text>
      </Card>

      {/* body */}
      {isLoading ? (
        <Loading label="Loading calendar…" />
      ) : isError ? (
        <ErrorBox message={`Could not load calendar: ${(error as Error)?.message ?? 'error'}`} onRetry={() => void refetch()} />
      ) : view === 'week' ? (
        <View style={styles.days}>
          {weekDates(weekStart).map((date) => (
            <DayCard
              key={date}
              date={date}
              cell={cells.get(date) ?? { date, events: [], activities: [] }}
              today={date === today}
              onOpen={goDay}
            />
          ))}
        </View>
      ) : (
        <Card style={styles.monthCard}>
          <View style={styles.monthHeaderRow}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <Text key={d} style={styles.monthDow}>
                {d}
              </Text>
            ))}
          </View>
          {grid.weeks.map((w) => (
            <View key={w[0]} style={styles.monthWeekRow}>
              {w.map((date) => {
                const cell = cells.get(date) ?? { date, events: [], activities: [] };
                return (
                  <MonthCell
                    key={date}
                    date={date}
                    cell={cell}
                    inMonth={isInMonth(date, monthAnc)}
                    today={date === today}
                    onOpen={goDay}
                  />
                );
              })}
            </View>
          ))}
        </Card>
      )}
      {!isLoading && !isError && events.length === 0 && activities.length === 0 ? (
        <Empty message="No events in this window. Sync now, or ask your coach to plan something." />
      ) : null}
    </View>
  );
}

function fmtKmOrDash(m: number): string {
  return m > 0 ? formatKm(m) : '—';
}

function Stat({
  label,
  planned,
  actual,
  hidePlanned,
}: {
  label: string;
  planned: string;
  actual: string;
  hidePlanned?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValues}>
        {hidePlanned ? null : <Text style={styles.statPlanned}>{planned}</Text>}
        {hidePlanned ? null : <Text style={styles.statSep}> → </Text>}
        <Text style={styles.statActual}>{actual}</Text>
      </Text>
    </View>
  );
}

function DayCard({
  date,
  cell,
  today,
  onOpen,
}: {
  date: string;
  cell: DayCell;
  today: boolean;
  onOpen: (date: string) => void;
}) {
  const pairedActivityIds = new Set(
    cell.activities.map((a) => a.paired_event_id).filter((x): x is number => typeof x === 'number'),
  );
  const pairedEvents = new Set(cell.events.filter((e) => pairedActivityIds.has(e.id ?? -1)).map((e) => e.id));
  const loneActivities = cell.activities.filter((a) => !pairedEvents.has(a.paired_event_id ?? -1));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${dayLabel(date)}`}
      onPress={() => onOpen(date)}
      style={({ pressed }) => [styles.dayCard, today && styles.dayCardToday, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.dayHead}>
        <Text style={[styles.dayName, today && styles.dayNameToday]}>{dayLabel(date)}</Text>
        {today ? <Badge label="today" tone="accent" /> : null}
      </View>
      {cell.events.length === 0 && loneActivities.length === 0 ? (
        <Text style={styles.dayEmpty}>—</Text>
      ) : null}
      {cell.events.map((e) => {
        const actual = cell.activities.find((a) => a.paired_event_id === e.id);
        return (
          <View key={`e${e.id ?? e.uid ?? e.start_date_local}`} style={styles.entry}>
            <View style={styles.entryHead}>
              {isRaceEvent(e) ? <Badge label={`RACE ${e.category?.slice(5)}`} tone="danger" /> : null}
              <Text style={styles.entryName} numberOfLines={1}>
                {actual ? '✓ ' : ''}
                {e.name ?? 'Planned workout'}
              </Text>
            </View>
            <Text style={styles.entryMeta}>{eventLine(e)}</Text>
            {actual ? <Text style={styles.entryActual}>✓ {activityLine(actual)}</Text> : null}
          </View>
        );
      })}
      {loneActivities.map((a) => (
        <View key={`a${a.id}`} style={styles.entry}>
          <Text style={styles.entryName} numberOfLines={1}>
            ✓ {a.name ?? 'Activity'}
          </Text>
          <Text style={styles.entryMeta}>{activityLine(a)}</Text>
        </View>
      ))}
    </Pressable>
  );
}

function MonthCell({
  date,
  cell,
  inMonth,
  today,
  onOpen,
}: {
  date: string;
  cell: DayCell;
  inMonth: boolean;
  today: boolean;
  onOpen: (date: string) => void;
}) {
  const races = cell.events.filter(isRaceEvent).length;
  const plans = cell.events.length - races;
  const recs = cell.activities.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date}: ${cell.events.length} planned, ${cell.activities.length} recorded`}
      onPress={() => onOpen(date)}
      style={({ pressed }) => [
        styles.monthCell,
        today && styles.monthCellToday,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.monthDayNum, !inMonth && styles.monthDayOut]}>{date.slice(8, 10)}</Text>
      <View style={styles.dots}>
        {plans > 0 ? (
          <Text style={styles.dotPlan}>{plans > 1 ? `${plans}◦` : '◦'}</Text>
        ) : null}
        {races > 0 ? <Text style={styles.dotRace}>!</Text> : null}
        {recs > 0 ? (
          <Text style={styles.dotDone}>{recs > 1 ? `${recs}●` : '●'}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { maxWidth: 860, width: '100%', alignSelf: 'center', padding: spacing.lg, paddingBottom: 0, gap: spacing.xs },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { color: colors.text, fontSize: fontSize.h, fontWeight: '700', marginHorizontal: spacing.xs, minWidth: 120, textAlign: 'center' },
  navBtn: { minWidth: 44, paddingHorizontal: spacing.md },
  syncMsg: { color: colors.muted, fontSize: fontSize.small },
  statsCard: { marginHorizontal: spacing.lg, marginTop: spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  stat: { gap: 2, minWidth: 90 },
  statLabel: { color: colors.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValues: { fontSize: fontSize.body },
  statPlanned: { color: colors.muted },
  statSep: { color: colors.muted },
  statActual: { color: colors.text, fontWeight: '600' },
  statsHint: { color: colors.muted, fontSize: fontSize.tiny },
  days: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dayCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dayCardToday: { borderColor: colors.accent },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayName: { color: colors.text, fontSize: fontSize.body, fontWeight: '700' },
  dayNameToday: { color: colors.accent },
  dayEmpty: { color: colors.muted, fontSize: fontSize.small },
  entry: { gap: 1 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entryName: { color: colors.text, fontSize: fontSize.small + 1, fontWeight: '600', flexShrink: 1 },
  entryMeta: { color: colors.muted, fontSize: fontSize.small },
  entryActual: { color: colors.accent, fontSize: fontSize.small },
  monthCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.xs },
  monthHeaderRow: { flexDirection: 'row' },
  monthDow: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: fontSize.tiny, fontWeight: '600' },
  monthWeekRow: { flexDirection: 'row', gap: 2 },
  monthCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  monthCellToday: { borderColor: colors.accent },
  monthDayNum: { color: colors.text, fontSize: fontSize.small },
  monthDayOut: { color: colors.muted, opacity: 0.45 },
  dots: { flexDirection: 'row', gap: 4, minHeight: 14, alignItems: 'center' },
  dotPlan: { color: colors.muted, fontSize: 10, lineHeight: 12 },
  dotRace: { color: colors.danger, fontSize: 10, fontWeight: '700', lineHeight: 12 },
  dotDone: { color: colors.accent, fontSize: 10, lineHeight: 12 },
});
