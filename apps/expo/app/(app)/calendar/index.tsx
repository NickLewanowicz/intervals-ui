/**
 * THE core screen. Round-9 layout system:
 * - ONE compact floating glass pill nav (two tight rows, ~40% shorter than
 *   the old stacked header — no dead vertical space).
 * - Page rhythm from theme.pageSpacing: nav → content, stats card → list,
 *   rows INSIDE one containing card with hairline separators (no more
 *   scattered floating day cards).
 * - Week view: a single "week sheet" — 7 day rows, tap opens day detail.
 * - Month view: tap selects a day (ring) and its entries render in a panel
 *   BELOW the grid (selection persists across month navigation, clamped to
 *   the month); long-press or the panel chevron opens the full day route.
 * - Stats card v2 (StatsCard.tsx): PRIMARY state + verdict, SECONDARY details.
 */
import {
  averagePaceMinPerKm,
  buildDayCells,
  formatDuration,
  formatKm,
  isRaceEvent,
  weeklyStats,
  type DayCell,
  type WeeklyStats,
} from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBar, GlassCard } from '@/components/glass';
import { PressableScale, SlideFadeIn } from '@/components/motion';
import { Badge, Button, Empty, ErrorBox, IconButton, Loading } from '@/components/ui';
import StatsCard from './StatsCard';
import { triggerSync } from '@/lib/api';
import {
  addDays,
  addMonths,
  clampToMonth,
  dayLabel,
  isInMonth,
  MONTHS,
  monthAnchor,
  monthGrid,
  monthLabelShort,
  startOfWeek,
  todayISO,
  weekDates,
  weekRangeLabel,
  weekRangeLabelShort,
  weekWindow,
  weekdayIndex,
} from '@/lib/dates';
import { activityLine, eventLine, relativeTime } from '@/lib/format';
import { useCalendarWindow, useInvalidateMirrors, useSyncState, useThresholdPace, useWellness } from '@/lib/queries';
import { fontSize, layout, pageSpacing, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/** Host node type accepted by measureLayout (derived, no deep RN import). */
type HostNode = Parameters<InstanceType<typeof View>['measureLayout']>[0];

export default function CalendarScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const today = todayISO();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const [monthAnc, setMonthAnc] = useState(() => monthAnchor(todayISO()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const week = weekWindow(weekStart);
  const grid = useMemo(() => monthGrid(monthAnc), [monthAnc]);
  const window = view === 'week' ? week : { from: grid.from, to: grid.to };

  const { data, isLoading, isFetching, isError, error, refetch } = useCalendarWindow(window.from, window.to);
  // the live week — verdict + gap stay about THIS week even in other windows
  const liveWeek = weekWindow(startOfWeek(today));
  const live = useCalendarWindow(liveWeek.from, liveWeek.to);
  const wellness = useWellness(30);
  const syncState = useSyncState();
  const thresholdPace = useThresholdPace();
  const invalidateMirrors = useInvalidateMirrors();

  // round-8 FIX-3: first load shows the skeleton ON this screen — never a
  // blank body. isLoading alone misses seeding/refetch (isFetching).
  const firstLoad = !data && (isLoading || isFetching);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // persona finding #9: the daily loop must not start with a hunt for today.
  // Scroll today's day row into view on mount / week change (week view only).
  const scrollRef = useRef<ScrollView>(null);
  const cardRefs = useRef(new Map<string, View | null>());
  const weekDatesList = weekDates(weekStart);
  const todayInWeek = weekDatesList.includes(today);
  const [measureTick, setMeasureTick] = useState(0);
  const noteCardLayout = (date: string) => () => {
    if (date === today) setMeasureTick((t) => t + 1);
  };

  useEffect(() => {
    if (view !== 'week' || isLoading || isError || !todayInWeek) return;
    const scroller = scrollRef.current;
    const card = cardRefs.current.get(today);
    if (!scroller || !card) return;
    const rel = scroller.getNativeScrollRef() ?? (scroller as unknown as HostNode);
    card.measureLayout(
      rel,
      (_x, y) => {
        scroller.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
      },
      () => undefined, // not laid out yet — the next layout tick retries
    );
  }, [view, weekStart, isLoading, isError, data, today, todayInWeek, measureTick]);

  // month view: keep a sensible selection — today when present, else the 1st;
  // an existing selection that lives in the month survives navigation.
  const gridDates = useMemo(() => grid.weeks.flat(), [grid]);
  useEffect(() => {
    if (view !== 'month') return;
    setSelectedDate((prev) => {
      if (prev && gridDates.includes(prev)) return prev;
      return gridDates.includes(today) ? today : monthAnc;
    });
  }, [view, monthAnc, gridDates, today]);

  const events = data?.events ?? [];
  const activities = data?.activities ?? [];
  const cells = useMemo(() => buildDayCells(events, activities), [events, activities]);
  // round-8 FIX-4: planned events often declare time but no distance — estimate
  // from the athlete's recent actual pace (threshold pace as fallback).
  const recentPace = useMemo(() => averagePaceMinPerKm(activities), [activities]);
  const pace = recentPace ?? thresholdPace.data ?? null;
  const stats = useMemo(
    () => weeklyStats(events, activities, weekStart, { paceMinPerKm: pace }),
    [events, activities, weekStart, pace],
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
      | 'plannedDistanceEstimated'
      | 'plannedTimeEstimated'
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
      const ws = weeklyStats(events, activities, w[0]!, { paceMinPerKm: pace });
      acc.plannedDistanceM += ws.plannedDistanceM;
      acc.plannedTimeSec += ws.plannedTimeSec;
      acc.plannedLoad += ws.plannedLoad;
      acc.actualDistanceM += ws.actualDistanceM;
      acc.actualTimeSec += ws.actualTimeSec;
      acc.actualLoad += ws.actualLoad;
      acc.longestRunM = Math.max(acc.longestRunM, ws.longestRunM);
      acc.plannedDistanceEstimated = acc.plannedDistanceEstimated || ws.plannedDistanceEstimated;
      acc.plannedTimeEstimated = acc.plannedTimeEstimated || ws.plannedTimeEstimated;
    }
    return acc;
  }, [events, activities, grid, pace]);

  // week/month switch transition direction (forward = slide from right)
  const navKey = `${view}:${view === 'week' ? weekStart : monthAnc}`;
  const prevKey = useRef(navKey);
  const dir: -1 | 1 = prevKey.current === navKey || navKey > prevKey.current ? 1 : -1;
  prevKey.current = navKey;

  const step = (n: -1 | 1) => {
    if (view === 'week') {
      setWeekStart(addDays(weekStart, 7 * n));
      return;
    }
    const next = addMonths(monthAnc, n);
    setMonthAnc(next);
    // persist the selection into the new month (same day, clamped to length)
    setSelectedDate((prev) => (prev ? clampToMonth(prev, next) : prev));
  };

  const goToday = () => {
    setWeekStart(startOfWeek(today));
    setMonthAnc(monthAnchor(today));
    if (view === 'month') setSelectedDate(today);
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
  const navTitle = view === 'week' ? weekRangeLabelShort(weekStart) : grid.label;
  const sundayLabel = `Sun ${addDays(startOfWeek(today), 6).slice(8, 10)}`;

  return (
    <View style={s.page}>
      {/* compact floating glass pill nav (round 9): nav row + view/sync row */}
      <View style={[s.headerWrap, { paddingTop: insets.top + spacing.sm }]}>
        <GlassBar edge="none" floating style={s.headerPill} testID="nav-pill">
          <View style={s.headerRow}>
            <IconButton
              icon="chevron-back"
              label="Previous"
              onPress={() => step(-1)}
              size={17}
              hitSlop={7}
              style={s.pillBtn}
            />
            <Text accessibilityRole="header" style={s.title} numberOfLines={1}>
              {navTitle}
            </Text>
            <IconButton
              icon="chevron-forward"
              label="Next"
              onPress={() => step(1)}
              size={17}
              hitSlop={7}
              style={s.pillBtn}
            />
            <View style={s.spring} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to today"
              onPress={goToday}
              hitSlop={8}
              style={s.todayBtn}
            >
              <Text style={s.todayText}>Today</Text>
            </Pressable>
          </View>
          <View style={s.headerRow}>
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
            <View style={s.spring} />
            <IconButton
              icon="sync"
              label="Sync now"
              onPress={() => void onSync()}
              loading={syncing}
              size={15}
              hitSlop={10}
              style={s.syncBtn}
            />
          </View>
        </GlassBar>
        {syncMsg ? (
          <Text style={s.syncMsg} numberOfLines={1}>
            {syncMsg}
          </Text>
        ) : null}
      </View>

      {/* scrolling body */}
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <SlideFadeIn dep={navKey} direction={dir} style={s.section}>
          <StatsCard
            caption={
              view === 'week'
                ? `planned vs actual · week of ${weekRangeLabel(weekStart).split(' – ')[0]}`
                : `planned vs actual · ${grid.label}`
            }
            stats={view === 'week' ? stats : monthStats}
            showLongest={view === 'week'}
            showZones={view === 'week'}
            freshness={lastSync ? relativeTime(lastSync) : null}
            onFreshnessPress={() => router.push('/settings')}
            wellness={wellness.data ?? []}
            wellnessLoading={!wellness.data && (wellness.isLoading || wellness.isFetching)}
            today={today}
            currentWeek={{
              events: live.data?.events ?? [],
              activities: live.data?.activities ?? [],
              horizonLabel: sundayLabel,
            }}
          />

          {firstLoad ? (
            <Loading label="Loading calendar…" />
          ) : isError ? (
            <ErrorBox
              message={`Could not load calendar: ${(error as Error)?.message ?? 'error'}`}
              onRetry={() => void refetch()}
            />
          ) : view === 'week' ? (
            /* ONE surface: day rows with hairline separators (no floating cards) */
            <GlassCard style={s.weekGroup} testID="week-group">
              {weekDatesList.map((date, i) => (
                <Fragment key={date}>
                  {i > 0 ? <View style={s.rowSep} /> : null}
                  <View
                    ref={(v) => {
                      cardRefs.current.set(date, v);
                    }}
                    onLayout={noteCardLayout(date)}
                  >
                    <DayRow
                      date={date}
                      cell={cells.get(date) ?? { date, events: [], activities: [] }}
                      today={date === today}
                      onOpen={goDay}
                    />
                  </View>
                </Fragment>
              ))}
            </GlassCard>
          ) : (
            <GlassCard style={s.monthCard} testID="month-card">
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
                        selected={selectedDate === date}
                        onSelect={() => setSelectedDate(date)}
                        onOpen={() => goDay(date)}
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
              {/* selected-day panel: the day's entries BELOW the grid, no navigation */}
              {selectedDate ? (
                <View style={s.dayPanel}>
                  <View style={s.rowSep} />
                  <View style={s.panelHead}>
                    <Text style={s.panelTitle}>
                      {`${dayLabel(selectedDate)} ${MONTHS[Number(selectedDate.slice(5, 7)) - 1]!.slice(0, 3)}`}
                    </Text>
                    {selectedDate === today ? <Badge label="today" tone="accent" /> : null}
                    <View style={s.spring} />
                    <IconButton
                      icon="chevron-forward"
                      label={`Open full day detail for ${dayLabel(selectedDate)}`}
                      onPress={() => goDay(selectedDate)}
                      size={15}
                      hitSlop={8}
                      style={s.panelOpenBtn}
                    />
                  </View>
                  <DayEntries
                    cell={cells.get(selectedDate) ?? { date: selectedDate, events: [], activities: [] }}
                    emptyText="Rest day — nothing planned, nothing recorded."
                  />
                </View>
              ) : null}
            </GlassCard>
          )}
          {!firstLoad && !isError && events.length === 0 && activities.length === 0 ? (
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

/** Entries of one day: planned events (merged with their recorded actual) + lone activities. */
function DayEntries({ cell, emptyText = 'Rest day' }: { cell: DayCell; emptyText?: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const pairedActivityIds = new Set(
    cell.activities.map((a) => a.paired_event_id).filter((x): x is number => typeof x === 'number'),
  );
  const pairedEvents = new Set(
    cell.events.filter((e) => pairedActivityIds.has(e.id ?? -1)).map((e) => e.id),
  );
  const loneActivities = cell.activities.filter((a) => !pairedEvents.has(a.paired_event_id ?? -1));

  if (cell.events.length === 0 && loneActivities.length === 0) {
    return <Text style={s.dayEmpty}>{emptyText}</Text>;
  }
  return (
    <View style={s.entries}>
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
    </View>
  );
}

/** One day row inside the week sheet (round 9: a row, not a floating card). */
function DayRow({
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
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Open ${dayLabel(date)}`}
      onPress={() => onOpen(date)}
      style={[s.dayRow, today && s.dayRowToday]}
    >
      <View style={s.dayHead}>
        <Text style={[s.dayName, today && { color: colors.accentText }]}>{dayLabel(date)}</Text>
        {today ? <Badge label="today" tone="accent" /> : null}
      </View>
      <DayEntries cell={cell} />
    </PressableScale>
  );
}

/**
 * Month cell (round 9): tap SELECTS — the day's entries show in the panel
 * below the grid. Long-press (or the panel chevron) opens the full day route.
 */
function MonthCell({
  date,
  cell,
  inMonth,
  today,
  selected,
  onSelect,
  onOpen,
}: {
  date: string;
  cell: DayCell;
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const races = cell.events.filter(isRaceEvent).length;
  const plans = cell.events.length - races;
  const recs = cell.activities.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={selected ? { selected: true } : {}}
      accessibilityLabel={`${date}: ${cell.events.length} planned, ${cell.activities.length} recorded`}
      accessibilityHint="Shows the day below the calendar. Long-press for full detail."
      onPress={onSelect}
      onLongPress={onOpen}
      style={[
        s.monthCell,
        today && s.monthCellToday,
        selected && s.monthCellSelected,
        !inMonth && s.monthCellOut,
      ]}
    >
      <Text style={s.monthDayNum}>{date.slice(8, 10)}</Text>
      <View style={s.dots}>
        {plans > 0 ? <View style={[s.dotPlan, { borderColor: colors.muted }]} /> : null}
        {races > 0 ? (
          <View style={[s.dotRace, { backgroundColor: colors.race, borderColor: colors.race }]} />
        ) : null}
        {recs > 0 ? (
          <View style={[s.dotDone, { backgroundColor: colors.text, borderColor: colors.text }]} />
        ) : null}
      </View>
    </Pressable>
  );
}

/** FIX-12: planned ○ muted · recorded ● text-tint · race ● race-tint. */
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
    // --- compact floating pill nav (round 9) ---
    headerWrap: { paddingHorizontal: layout.tabBarInset },
    headerPill: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.maxW,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      gap: 2,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    pillBtn: { width: 30, height: 30, borderRadius: radius.sm + 2 },
    title: {
      color: p.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      flexShrink: 1,
      fontVariant: ['tabular-nums'],
    },
    spring: { flex: 1 },
    todayBtn: {
      minHeight: 30,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radius.sm + 2,
    },
    todayText: { color: p.accentText, fontSize: fontSize.small, fontWeight: '700' },
    segmented: {
      flexDirection: 'row',
      backgroundColor: p.bg,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      padding: 2,
      gap: 2,
    },
    segBtn: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md - 2,
      paddingVertical: 3,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 54,
    },
    segText: { fontSize: fontSize.tiny + 1, fontWeight: '600' },
    syncBtn: { width: 26, height: 26, borderRadius: radius.sm + 1 },
    syncMsg: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    // --- body rhythm (pageSpacing, round 9) ---
    scroll: { flex: 1 },
    scrollContent: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      paddingLeft: spacing.lg,
      paddingRight: spacing.lg,
      paddingTop: pageSpacing.navToContent,
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
    },
    // the section stack lives INSIDE the slide transition (one animated view)
    section: { gap: pageSpacing.sectionGap },
    // --- week sheet: ONE containing card, hairline-separated rows ---
    weekGroup: { paddingVertical: pageSpacing.cardGap / 2, overflow: 'hidden' },
    rowSep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: p.border,
      marginHorizontal: pageSpacing.rowPadX,
    },
    dayRow: {
      paddingHorizontal: pageSpacing.rowPadX,
      paddingVertical: pageSpacing.rowPadY,
      gap: spacing.xs,
    },
    dayRowToday: { backgroundColor: p.accentSoft },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dayName: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    dayEmpty: { color: p.muted, fontSize: fontSize.small },
    entries: { gap: spacing.sm + 2 },
    entry: { gap: 1, paddingLeft: spacing.sm },
    entryRace: { borderLeftWidth: 2 },
    entryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    entryName: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '600', flexShrink: 1 },
    entryMeta: { color: p.muted, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    entryActual: { color: p.accentText, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    // --- month view (same padding system) ---
    monthCard: {
      gap: spacing.sm,
      padding: pageSpacing.cardPad,
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
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    monthCellToday: { borderColor: p.borderStrong },
    monthCellSelected: { borderColor: p.accent, backgroundColor: p.accentSoft },
    monthCellOut: { opacity: 0.45 },
    monthDayNum: { color: p.text, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    dots: { flexDirection: 'row', gap: 3, minHeight: 7, alignItems: 'center' },
    dotPlan: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
    dotRace: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
    dotDone: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.5 },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
    legendText: { color: p.muted, fontSize: fontSize.tiny },
    dayPanel: { gap: spacing.sm, marginTop: spacing.xs },
    panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    panelTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    panelOpenBtn: { width: 28, height: 28, borderRadius: radius.sm + 1 },
  });
