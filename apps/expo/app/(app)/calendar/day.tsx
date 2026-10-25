/**
 * Day detail route (deep-linkable: /calendar/day?date=YYYY-MM-DD). Round-13
 * extracted the CONTENT into the shared DayDetails component (week-view v2
 * spec §3) — this screen is now just chrome: back header + loading/error
 * states + the scroll body. The calendar week view renders the same
 * DayDetails in its side panel (desktop) / bottom sheet (mobile).
 */
import { buildDayCells } from '@intervals/core';
import { Link, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, ErrorBox, IconButton, Loading } from '@/components/ui';
import DayDetails from './DayDetails';
import { MONTHS, dayLabel, isValidISO, todayISO } from '@/lib/dates';
import { averagePaceMinPerKm } from '@intervals/core';
import { useCalendarWindow, useThresholdPace } from '@/lib/queries';
import { fontSize, layout, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

export default function DayScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' && isValidISO(params.date) ? params.date : todayISO();
  const { data, isLoading, isError, error } = useCalendarWindow(date, date);
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
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <Loading label="Loading day…" />
        ) : isError ? (
          <ErrorBox message={`Could not load day: ${(error as Error)?.message ?? 'error'}`} />
        ) : (
          <DayDetails cell={cell} today={todayISO()} />
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
