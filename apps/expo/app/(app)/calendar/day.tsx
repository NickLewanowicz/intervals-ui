/**
 * Day detail route (deep-linkable: /calendar/day?date=YYYY-MM-DD). Round-13
 * extracted the CONTENT into the shared DayDetails component (week-view v2
 * spec §3) — this screen is now just chrome: back header + day nav +
 * loading/error states + the scroll body. The calendar week view renders the
 * same DayDetails in its side panel (desktop) / bottom sheet (mobile).
 *
 * QA A3: the query covers a ±3-day window (not the bare single date) so a
 * cold deep link resolves from the mirror even when date boundaries or a
 * stale cached slice would empty a one-day window, and the body stays on the
 * loading skeleton until the window actually resolves — a not-yet-loaded day
 * never renders as a false "rest day".
 */
import { buildDayCells } from '@intervals/core';
import { Link, router, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, ErrorBox, IconButton, Loading } from '@/components/ui';
import DayDetails from './DayDetails';
import { MONTHS, addDays, dayLabel, isValidISO, todayISO } from '@/lib/dates';
import { averagePaceMinPerKm } from '@intervals/core';
import { useCalendarWindow, useThresholdPace } from '@/lib/queries';
import { fontSize, layout, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/** The day route fetches a ±3-day window around the target date (QA A3). */
const DAY_WINDOW_PAD = 3;

export default function DayScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' && isValidISO(params.date) ? params.date : todayISO();
  const { data, isError, error, refetch } = useCalendarWindow(
    addDays(date, -DAY_WINDOW_PAD),
    addDays(date, DAY_WINDOW_PAD),
  );
  const thresholdPace = useThresholdPace();

  const cell = useMemo(() => {
    const cells = buildDayCells(data?.events ?? [], data?.activities ?? []);
    return cells.get(date) ?? { date, events: [], activities: [] };
  }, [data, date]);
  const pace = useMemo(() => {
    const recent = averagePaceMinPerKm(data?.activities ?? []);
    return recent ?? thresholdPace.data ?? null;
  }, [data, thresholdPace.data]);

  const fullLabel = `${dayLabel(date)} ${MONTHS[Number(date.slice(5, 7)) - 1]!.slice(0, 3)} ${date.slice(0, 4)}`;
  const goDay = (d: string) => router.replace({ pathname: '/calendar/day', params: { date: d } });

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Link href="/calendar" replace asChild>
          <IconButton icon="chevron-back" label="Back to calendar" />
        </Link>
        <Text style={s.title} numberOfLines={1}>
          {fullLabel}
        </Text>
        {date === todayISO() ? <Badge label="today" tone="accent" /> : null}
        {/* forward action (QA A3 acceptance): step to the neighbouring days */}
        <IconButton icon="chevron-forward" label={`Next day after ${dayLabel(date)}`} onPress={() => goDay(addDays(date, 1))} />
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* resolved-or-skeleton: initialData seeding can make isLoading false
            before the mirror fetch lands — an unknown day must never render as
            a false "rest day". Error wins over stale seed data. */}
        {isError ? (
          <ErrorBox
            message={`Could not load day: ${(error as Error)?.message ?? 'error'}`}
            onRetry={() => void refetch()}
          />
        ) : data == null ? (
          <Loading label="Loading day…" />
        ) : (
          <DayDetails cell={cell} today={todayISO()} paceMinPerKm={pace} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    header: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    title: { color: p.text, fontSize: fontSize.h, fontWeight: '700', flexShrink: 1 },
    scroll: { flex: 1 },
    body: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
    },
  });
