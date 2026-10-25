/**
 * THE core screen. Week view (7 day cards, planned vs recorded) with a
 * monthly grid toggle, stats strip (week- or month-scoped — FIX-3), manual
 * sync with last-sync freshness (FIX-6), and a fixed glass header over a
 * truly scrolling body (FIX-2). Week/month switches get a ≤200ms slide+fade.
 */
import {
  buildDayCells,
  formatDuration,
  formatKm,
  isRaceEvent,
  weeklyStats,
  type WeeklyStats,
} from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBar, GlassCard } from '@/components/glass';
import { PressableScale, SlideFadeIn } from '@/components/motion';
import { Badge, Button, Empty, ErrorBox, IconButton, Loading } from '@/components/ui';
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
import { activityLine, eventLine, relativeTime } from '@/lib/format';
import { useCalendarWindow, useInvalidateMirrors, useSyncState } from '@/lib/queries';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { DayCell } from '@intervals/core';

export default function CalendarScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const today = todayISO();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const [monthAnc, setMonthAnc] = useState(() => monthAnchor(todayISO()));

  const week = weekWindow(weekStart);
  const grid = useMemo(() => monthGrid(monthAnc), [monthAnc]);
  const window = view === 'week' ? week : { from: grid.from, to: grid.to };

  const { data, isLoading, isError, error, refetch } = useCalendarWindow(window.from, window.to);
  const syncState = useSyncState();
  const invalidateMirrors = useInvalidateMirrors();

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const events = data?.events ?? [];
  const activities = data?.activities ?? [];
  const cells = useMemo(() => buildDayCells(events, activities), [events, activities]);
  const stats = useMemo(
    () => weeklyStats(events, activities, weekStart),
    [events, activities, weekStart],
  );
  // FIX-3: in month view aggregate the visible month instead of the stale week
  const monthStats = useMemo(() => {
    const acc: Pick<
      WeeklyStats,
      | 'plannedDistanceM'
      | 'plannedTimeSec'
      | 'plannedLoad'
      | 'actualDistanceM'
      | 'actualTimeSec'
      | 'actualLoad'
      | 'longestRunM'
    > = {
      plannedDistanceM: 0,
      plannedTimeSec: 0,
      plannedLoad: 0,
      actualDistanceM: 0,
      actualTimeSec: 0,
      actualLoad: 0,
      longestRunM: 0,
    };
    for (const w of grid.weeks) {
      const ws = weeklyStats(events, activities, w[0]!);
      acc.plannedDistanceM += ws.plannedDistanceM;
      acc.plannedTimeSec += ws.plannedTimeSec;
      acc.plannedLoad += ws.plannedLoad;
      acc.actualDistanceM += ws.actualDistanceM;
      acc.actualTimeSec += ws.actualTimeSec;
      acc.actualLoad += ws.actualLoad;
      acc.longestRunM = Math.max(acc.longestRunM, ws.longestRunM);
    }
    return acc;
  }, [events, activities, grid]);

  // week/month switch transition direction (forward = slide from right)
  const navKey = `${view}:${view === 'week' ? weekStart : monthAnc}`;
  const prevKey = useRef(navKey);
  const dir: -1 | 1 = prevKey.current === navKey || navKey > prevKey.current ? 1 : -1;
  prevKey.current = navKey;

  const step = (n: -1 | 1) => {
    if (view === 'week') setWeekStart(addDays(weekStart, 7 * n));
    else setMonthAnc(addMonths(monthAnc, n));
  };

  const goToday = () => {
    setWeekStart(startOfWeek(today));
    setMonthAnc(monthAnchor(today));
  };

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

  const lastSync = syncState.data?.lastSync ?? null;

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      {/* fixed glass header: nav + view toggle + sync (FIX-6 freshness chip) */}
      <GlassBar edge="bottom" style={s.headerBar}>
        <View style={s.headerInner}>
          <View style={s.navRow}>
            <IconButton icon="chevron-back" label="Previous" onPress={() => step(-1)} />
            <Text style={s.title} numberOfLines={1}>
              {view === 'week' ? weekRangeLabel(weekStart) : grid.label}
            </Text>
            <IconButton icon="chevron-forward" label="Next" onPress={() => step(1)} />
            <View style={{ flex: 1 }} />
            <Button title="Today" variant="ghost" onPress={goToday} style={s.todayBtn} />
          </View>
          <View style={s.subRow}>
            <View style={s.segmented}>
              {(['week', 'month'] as const).map((v) => {
                const active = view === v;
                return (
                  <Pressable
                    key={v}
                    accessibilityRole="button"
                    accessibilityState={active ? { selected: true } : {}}
                    accessibilityLabel={`${v} view`}
                    onPress={() => setView(v)}
                    style={[s.segBtn, active && { backgroundColor: colors.accent }]}
                  >
                    <Text style={[s.segText, { color: active ? colors.onAccent : colors.muted }]}>
                      {v === 'week' ? 'Week' : 'Month'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sync status — open settings"
              onPress={() => router.push('/settings')}
              hitSlop={6}
            >
              <Text style={s.syncFresh} numberOfLines={1}>
                {lastSync ? `synced ${relativeTime(lastSync)}` : 'not synced yet'}
              </Text>
            </Pressable>
            <IconButton icon="sync" label="Sync now" onPress={() => void onSync()} loading={syncing} />
          </View>
          {syncMsg ? (
            <Text style={s.syncMsg} numberOfLines={1}>
              {syncMsg}
            </Text>
          ) : null}
        </View>
      </GlassBar>

      {/* scrolling body (FIX-2) */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <SlideFadeIn dep={navKey} direction={dir}>
          <GlassCard style={[s.statsCard, view === 'month' && s.statsCardMonth]}>
            <StatsStrip
              caption={
                view === 'week'
                  ? `planned vs actual · week of ${weekRangeLabel(weekStart).split(' – ')[0]}`
                  : `planned vs actual · ${grid.label}`
              }
              stats={view === 'week' ? stats : monthStats}
              showLongest={view === 'week'}
            />
          </GlassCard>

          {isLoading ? (
            <Loading label="Loading calendar…" />
          ) : isError ? (
            <ErrorBox
              message={`Could not load calendar: ${(error as Error)?.message ?? 'error'}`}
              onRetry={() => void refetch()}
            />
          ) : view === 'week' ? (
            <View style={s.days}>
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
            <GlassCard style={s.monthCard}>
              <View style={s.monthHeaderRow}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <Text key={d} style={s.monthDow}>
                    {d}
                  </Text>
                ))}
              </View>
              {grid.weeks.map((w) => (
                <View key={w[0]} style={s.monthWeekRow}>
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
              {/* FIX-12 legend: planned / recorded / race are eye-distinguishable */}
              <View style={s.legendRow}>
                <LegendDot kind="plan" />
                <Text style={s.legendText}>planned</Text>
                <LegendDot kind="done" />
                <Text style={s.legendText}>recorded</Text>
                <LegendDot kind="race" />
                <Text style={s.legendText}>race</Text>
              </View>
            </GlassCard>
          )}
          {!isLoading && !isError && events.length === 0 && activities.length === 0 ? (
            <Empty
              message="No events in this window. Sync now, or ask your coach to plan something."
              icon="calendar-clear-outline"
            />
          ) : null}
        </SlideFadeIn>
      </ScrollView>
    </View>
  );
}

function StatsStrip({
  caption,
  stats,
  showLongest,
}: {
  caption: string;
  stats: Pick<
    WeeklyStats,
    | 'plannedDistanceM'
    | 'plannedTimeSec'
    | 'plannedLoad'
    | 'actualDistanceM'
    | 'actualTimeSec'
    | 'actualLoad'
    | 'longestRunM'
  >;
  showLongest: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <>
      <View style={s.statsGrid}>
        <Stat
          label="Distance"
          planned={fmtKmOrDash(stats.plannedDistanceM)}
          actual={fmtKmOrDash(stats.actualDistanceM)}
        />
        <Stat
          label="Time"
          planned={stats.plannedTimeSec ? formatDuration(stats.plannedTimeSec) : '—'}
          actual={stats.actualTimeSec ? formatDuration(stats.actualTimeSec) : '—'}
        />
        <Stat
          label="Load"
          planned={stats.plannedLoad ? String(Math.round(stats.plannedLoad)) : '—'}
          actual={stats.actualLoad ? String(Math.round(stats.actualLoad)) : '—'}
        />
        {showLongest ? (
          <Stat
            label="Longest run"
            actual={stats.longestRunM ? formatKm(stats.longestRunM) : '—'}
            planned="—"
            hidePlanned
          />
        ) : null}
      </View>
      <Text style={s.statsHint}>{caption}</Text>
    </>
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
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValues}>
        {hidePlanned ? null : <Text style={s.statPlanned}>{planned}</Text>}
        {hidePlanned ? null : <Text style={s.statSep}> → </Text>}
        <Text style={s.statActual}>{actual}</Text>
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
  const { colors } = useTheme();
  const s = styles(colors);
  const pairedActivityIds = new Set(
    cell.activities.map((a) => a.paired_event_id).filter((x): x is number => typeof x === 'number'),
  );
  const pairedEvents = new Set(
    cell.events.filter((e) => pairedActivityIds.has(e.id ?? -1)).map((e) => e.id),
  );
  const loneActivities = cell.activities.filter((a) => !pairedEvents.has(a.paired_event_id ?? -1));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${dayLabel(date)}`}
      onPress={() => onOpen(date)}
      style={[s.dayCard, today && s.dayCardToday]}
    >
      <View style={s.dayHead}>
        <Text style={[s.dayName, today && { color: colors.accentText }]}>{dayLabel(date)}</Text>
        {today ? <Badge label="today" tone="accent" /> : null}
      </View>
      {cell.events.length === 0 && loneActivities.length === 0 ? (
        <Text style={s.dayEmpty}>Rest day</Text>
      ) : null}
      {cell.events.map((e) => {
        const actual = cell.activities.find((a) => a.paired_event_id === e.id);
        const race = isRaceEvent(e);
        return (
          <View
            key={`e${e.id ?? e.uid ?? e.start_date_local}`}
            style={[s.entry, race && [s.entryRace, { borderLeftColor: colors.race }]]}
          >
            <View style={s.entryHead}>
              {race ? <Badge label={`RACE ${e.category?.slice(5) ?? ''}`} tone="race" icon="flag" /> : null}
              <Text style={s.entryName} numberOfLines={1}>
                {e.name ?? 'Planned workout'}
              </Text>
              {actual ? <Ionicons name="checkmark-circle" size={14} color={colors.success} /> : null}
            </View>
            <Text style={s.entryMeta}>{eventLine(e)}</Text>
            {actual ? <Text style={s.entryActual}>✓ {activityLine(actual)}</Text> : null}
          </View>
        );
      })}
      {loneActivities.map((a) => (
        <View key={`a${a.id}`} style={s.entry}>
          <View style={s.entryHead}>
            <Text style={s.entryName} numberOfLines={1}>
              {a.name ?? 'Activity'}
            </Text>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          </View>
          <Text style={s.entryMeta}>{activityLine(a)}</Text>
        </View>
      ))}
    </PressableScale>
  );
}

/** FIX-12: planned ○ muted · recorded ● text-tint · race ● race-tint. */
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
  const { colors } = useTheme();
  const s = styles(colors);
  const races = cell.events.filter(isRaceEvent).length;
  const plans = cell.events.length - races;
  const recs = cell.activities.length;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${date}: ${cell.events.length} planned, ${cell.activities.length} recorded`}
      onPress={() => onOpen(date)}
      style={[s.monthCell, today && s.monthCellToday, !inMonth && s.monthCellOut]}
    >
      <Text style={s.monthDayNum}>{date.slice(8, 10)}</Text>
      <View style={s.dots}>
        {plans > 0 ? <View style={[s.dotPlan, { borderColor: colors.muted }]} /> : null}
        {races > 0 ? <View style={[s.dotRace, { backgroundColor: colors.race, borderColor: colors.race }]} /> : null}
        {recs > 0 ? <View style={[s.dotDone, { backgroundColor: colors.text, borderColor: colors.text }]} /> : null}
      </View>
    </PressableScale>
  );
}

function LegendDot({ kind }: { kind: 'plan' | 'done' | 'race' }) {
  const { colors } = useTheme();
  if (kind === 'plan') return <View style={[styles(colors).dotPlan, { borderColor: colors.muted }]} />;
  if (kind === 'race')
    return <View style={[styles(colors).dotRace, { backgroundColor: colors.race, borderColor: colors.race }]} />;
  return <View style={[styles(colors).dotDone, { backgroundColor: colors.text, borderColor: colors.text }]} />;
}

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    headerBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
    headerInner: { maxWidth: layout.maxW, width: '100%', alignSelf: 'center', gap: spacing.sm },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    todayBtn: { minHeight: 38, paddingHorizontal: spacing.md },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: {
      color: p.text,
      fontSize: fontSize.body + 2,
      fontWeight: '700',
      flexShrink: 1,
      fontVariant: ['tabular-nums'],
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: p.bg,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      padding: 3,
      gap: 2,
    },
    segBtn: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 64,
    },
    segText: { fontSize: fontSize.small, fontWeight: '600' },
    syncFresh: { color: p.muted, fontSize: fontSize.tiny, marginRight: spacing.sm, flexShrink: 1 },
    syncMsg: { color: p.muted, fontSize: fontSize.tiny, marginTop: spacing.xs },
    scroll: { flex: 1 },
    scrollContent: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
      gap: spacing.md,
    },
    statsCard: { padding: spacing.lg, gap: spacing.sm },
    statsCardMonth: { alignSelf: 'center', width: '100%', maxWidth: 560 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
    stat: { gap: 2, minWidth: 90 },
    statLabel: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
    statValues: { fontSize: fontSize.body, fontVariant: ['tabular-nums'] },
    statPlanned: { color: p.muted },
    statSep: { color: p.muted },
    statActual: { color: p.text, fontWeight: '600' },
    statsHint: { color: p.muted, fontSize: fontSize.tiny },
    days: { gap: spacing.sm },
    dayCard: {
      backgroundColor: p.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    dayCardToday: { borderColor: p.accent, borderWidth: 1 },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dayName: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    dayEmpty: { color: p.muted, fontSize: fontSize.small },
    entry: { gap: 1, paddingLeft: spacing.sm },
    entryRace: { borderLeftWidth: 2 },
    entryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    entryName: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '600', flexShrink: 1 },
    entryMeta: { color: p.muted, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    entryActual: { color: p.accentText, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    monthCard: {
      gap: spacing.sm,
      padding: spacing.md,
      alignSelf: 'center',
      width: '100%',
      maxWidth: 560,
    },
    monthHeaderRow: { flexDirection: 'row' },
    monthDow: { flex: 1, textAlign: 'center', color: p.muted, fontSize: fontSize.tiny, fontWeight: '600' },
    monthWeekRow: { flexDirection: 'row', gap: 2 },
    monthCell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    monthCellToday: { borderWidth: 1, borderColor: p.accent },
    monthCellOut: { opacity: 0.5 },
    monthDayNum: { color: p.text, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    dots: { flexDirection: 'row', gap: 3, minHeight: 7, alignItems: 'center' },
    dotPlan: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
    dotRace: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
    dotDone: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
    legendText: { color: p.muted, fontSize: fontSize.tiny },
  });
