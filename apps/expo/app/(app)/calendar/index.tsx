/**
 * THE core screen. Round-13 "week view v2" layout (design spec
 * docs/design/calendar-week-v2-spec.md) on the round-11 hero chassis:
 * - HeroCard (untouched): controls row + merged summary tiles + verdict +
 *   details drawer.
 * - Week view: day-strip pills (Mon–Sun with recorded/planned/race/today
 *   markers — tap selects + scrolls the day into view), then one week sheet
 *   of titled DayCards (rollup chips) whose runs render as RunCards with
 *   intensity edges, status chips and labeled metric grids (no dot-lines).
 * - Divergent detail flows: tapping a run/day opens the day detail NEXT TO
 *   the list on desktop ≥900px (DetailSidePanel animates in to the right;
 *   the list column narrows) and as a bottom sheet on mobile/native
 *   (DetailSheet, ProposalModal chassis + drag-to-close). The /calendar/day
 *   route stays for deep links ("Open full").
 * - Month view: tap selects a day (ring) and its entries (RunCards) render
 *   in a panel BELOW the grid; long-press or the panel chevron opens the
 *   full day route.
 */
import {
  averagePaceMinPerKm,
  buildDayCells,
  weeklyStats,
  type DayCell,
  type WeeklyStats,
} from '@intervals/core';
import { router } from 'expo-router';
import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '@/components/glass';
import { PressableScale, SlideFadeIn } from '@/components/motion';
import { Badge, Empty, ErrorBox, IconButton, Loading } from '@/components/ui';
import HeroCard from './HeroCard';
import { DayCard, DayStrip, RunList } from './WeekCards';
import DetailSidePanel, { PANEL_W } from './DetailSidePanel';
import DetailSheet from './DetailSheet';
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
} from '@/lib/dates';
import { relativeTime } from '@/lib/format';
import { useCalendarWindow, useInvalidateMirrors, useSyncState, useThresholdPace, useWellness, useWidgetSnapshotSync } from '@/lib/queries';
import { fontSize, layout, pageSpacing, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/** Host node type accepted by measureLayout (derived, no deep RN import). */
type HostNode = Parameters<InstanceType<typeof View>['measureLayout']>[0];

/** Viewport at which the detail flips from bottom sheet to side panel. */
const WIDE_BREAKPOINT = 900;

export default function CalendarScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const wide = winW >= WIDE_BREAKPOINT;
  const today = todayISO();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const [monthAnc, setMonthAnc] = useState(() => monthAnchor(todayISO()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  /** The ONE open day detail (side panel on desktop, sheet on mobile/native). */
  const [detailDate, setDetailDate] = useState<string | null>(null);

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
  // round-16: feed the Android home-screen widgets (fire-and-forget snapshot)
  useWidgetSnapshotSync();

  // round-8 FIX-3: first load shows the skeleton ON this screen — never a
  // blank body. isLoading alone misses seeding/refetch (isFetching).
  const firstLoad = !data && (isLoading || isFetching);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // persona finding #9: the daily loop must not start with a hunt for today.
  // Scroll today's day card into view on mount / week change (week view only).
  const scrollRef = useRef<ScrollView>(null);
  const cardRefs = useRef(new Map<string, View | null>());
  const weekDatesList = useMemo(() => weekDates(weekStart), [weekStart]);
  const todayInWeek = weekDatesList.includes(today);
  const [measureTick, setMeasureTick] = useState(0);
  const noteCardLayout = (date: string) => () => {
    if (date === today) setMeasureTick((t) => t + 1);
  };

  const scrollToDate = (date: string) => {
    const scroller = scrollRef.current;
    const card = cardRefs.current.get(date);
    if (!scroller || !card) return;
    const rel = scroller.getNativeScrollRef() ?? (scroller as unknown as HostNode);
    card.measureLayout(
      rel,
      (_x, y) => {
        scroller.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
      },
      () => undefined, // not laid out yet — the next layout tick retries
    );
  };

  useEffect(() => {
    if (view !== 'week' || isLoading || isError || !todayInWeek) return;
    scrollToDate(today);
    // measureTick retries when today's card relayouts (data/load transitions)
  }, [view, weekStart, isLoading, isError, data, today, todayInWeek, measureTick]);

  // day pills: tap = select + scroll the day card into view (spec §1)
  const onPillSelect = (date: string) => {
    setSelectedDate(date);
    scrollToDate(date);
  };

  // detail flows (spec §3): one detail at a time; the panel progress drives
  // BOTH the panel's slide-in and the week column's narrowing.
  const panelProgress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(panelProgress, {
      toValue: detailDate != null && wide ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width/maxWidth are layout props
    }).start();
  }, [detailDate, wide, panelProgress]);

  // navigating weeks (or switching views) closes a detail that left the window
  useEffect(() => {
    if (detailDate && !weekDatesList.includes(detailDate)) setDetailDate(null);
  }, [weekDatesList, detailDate]);

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
  const cellFor = (date: string): DayCell => cells.get(date) ?? { date, events: [], activities: [] };
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
  const navTitle = view === 'week' ? weekRangeLabelShort(weekStart) : monthLabelShort(monthAnc);
  const scopeLabel =
    view === 'week'
      ? weekStart === startOfWeek(today)
        ? 'This week'
        : `Week of ${weekRangeLabel(weekStart).split(' – ')[0]}`
      : monthAnc === monthAnchor(today)
        ? 'This month'
        : monthLabelShort(monthAnc);
  const sundayLabel = `Sun ${addDays(startOfWeek(today), 6).slice(8, 10)}`;

  // the window sheet + detail side panel share one row; the row's max width
  // animates so opening the panel GROWS the layout rightward while the list
  // column narrows (both driven by the same 0..1 progress).
  const rowMax = wide
    ? panelProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [layout.maxW, layout.maxW + PANEL_W + spacing.lg],
      })
    : layout.maxW;

  return (
    <View style={s.page}>
      {/* scrolling body — the hero scrolls with the sheet so small viewports
          keep full access to the day rows */}
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          {
            paddingTop: insets.top + spacing.sm + pageSpacing.navToContent,
            // desktop: reserve room for the detail side panel (the window row
            // itself animates 860 → 860+panel as the panel opens)
            maxWidth: wide ? layout.maxW + PANEL_W + spacing.lg : layout.maxW,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.section}>
          {/* ONE hero surface: controls + tile strip + verdict + drawer */}
          <View>
            <HeroCard
              view={view}
              title={navTitle}
              scopeLabel={scopeLabel}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onToday={goToday}
              onView={setView}
              onSync={() => void onSync()}
              syncing={syncing}
              freshness={lastSync ? relativeTime(lastSync) : null}
              onFreshnessPress={() => router.push('/settings')}
              stats={view === 'week' ? stats : monthStats}
              showZones={view === 'week'}
              wellness={wellness.data ?? []}
              wellnessLoading={!wellness.data && (wellness.isLoading || wellness.isFetching)}
              today={today}
              currentWeek={{
                events: live.data?.events ?? [],
                activities: live.data?.activities ?? [],
                horizonLabel: sundayLabel,
              }}
            />
            {syncMsg ? (
              <Text style={s.syncMsg} numberOfLines={1}>
                {syncMsg}
              </Text>
            ) : null}
          </View>

          <Animated.View style={[s.windowRow, { maxWidth: rowMax }]}>
            <View style={s.windowCol}>
              <SlideFadeIn dep={navKey} direction={dir}>
                {firstLoad ? (
                  <Loading label="Loading calendar…" />
                ) : isError ? (
                  <ErrorBox
                    message={`Could not load calendar: ${(error as Error)?.message ?? 'error'}`}
                    onRetry={() => void refetch()}
                  />
                ) : view === 'week' ? (
                  /* ONE surface: day pills + titled day cards (hairline-separated) */
                  <GlassCard style={s.weekGroup} testID="week-group">
                    <DayStrip
                      dates={weekDatesList}
                      cellOf={(d) => cells.get(d)}
                      today={today}
                      selected={selectedDate}
                      onSelect={onPillSelect}
                    />
                    <View style={s.rowSep} />
                    {weekDatesList.map((date, i) => (
                      <Fragment key={date}>
                        {i > 0 ? <View style={s.rowSep} /> : null}
                        <View
                          ref={(v) => {
                            cardRefs.current.set(date, v);
                          }}
                          onLayout={noteCardLayout(date)}
                        >
                          <DayCard
                            date={date}
                            cell={cellFor(date)}
                            today={today}
                            paceMinPerKm={pace}
                            selected={selectedDate === date}
                            onOpen={setDetailDate}
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
                          const cell = cellFor(date);
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
                    {/* selected-day panel: the day's runs BELOW the grid, no navigation */}
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
                        <RunList
                          cell={cellFor(selectedDate)}
                          today={today}
                          paceMinPerKm={pace}
                          onPressRun={() => setDetailDate(selectedDate)}
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
            </View>
            {wide ? (
              <DetailSidePanel
                date={detailDate}
                cellFor={cellFor}
                today={today}
                progress={panelProgress}
                onClose={() => setDetailDate(null)}
              />
            ) : null}
          </Animated.View>
        </View>
      </ScrollView>
      {/* mobile + native: the same detail as a bottom sheet (spec §3) */}
      {!wide && detailDate ? (
        <DetailSheet date={detailDate} cellFor={cellFor} today={today} onClose={() => setDetailDate(null)} />
      ) : null}
    </View>
  );
}

/**
 * Month cell (round 9): tap SELECTS — the day's runs show in the panel
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
  const races = cell.events.filter((e) => (e.category ?? '').startsWith('RACE')).length;
  const plans = cell.events.length - races;
  const recs = cell.activities.length;
  return (
    <PressableScale
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
    </PressableScale>
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
    spring: { flex: 1 },
    syncMsg: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    // --- body rhythm (pageSpacing; top inset padding applied inline) ---
    scroll: { flex: 1 },
    scrollContent: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      paddingLeft: spacing.lg,
      paddingRight: spacing.lg,
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
    },
    // the section stack: hero (static) + sliding window sheet (+ detail panel)
    section: { gap: pageSpacing.sectionGap },
    windowRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      width: '100%',
      alignSelf: 'center',
    },
    windowCol: { flex: 1, minWidth: 0 },
    // --- week sheet: ONE containing card, pills + hairline-separated cards ---
    weekGroup: { paddingVertical: pageSpacing.cardGap / 2, overflow: 'hidden' },
    rowSep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: p.border,
      marginHorizontal: pageSpacing.rowPadX,
    },
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
