/**
 * Day detail (pushed from the calendar): full event description, recorded
 * actuals, and the zone-times stacked bar (FIX-4) — "how hard did it go"
 * readable as a distribution, not prose.
 */
import { buildDayCells, formatDuration, isRaceEvent } from '@intervals/core';
import { Link, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '@/components/glass';
import { Badge, Empty, ErrorBox, IconButton, Loading } from '@/components/ui';
import WorkoutTimeline from '@/components/WorkoutTimeline';
import { MONTHS, dayLabel, isValidISO, timeLabel, todayISO, weekdayIndex } from '@/lib/dates';
import { activityLine, eventLine, zoneSecondsOf } from '@/lib/format';
import { useCalendarWindow } from '@/lib/queries';
import { fontSize, layout, radius, spacing, zoneColor, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { Activity } from '@intervals/core';

export default function DayScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' && isValidISO(params.date) ? params.date : todayISO();
  const { data, isLoading, isError, error } = useCalendarWindow(date, date);

  const cell = useMemo(() => {
    const cells = buildDayCells(data?.events ?? [], data?.activities ?? []);
    return cells.get(date) ?? { date, events: [], activities: [] };
  }, [data, date]);

  const { events, activities } = cell;
  const loneActivities = activities.filter(
    (a) => !events.some((e) => e.id != null && e.id === a.paired_event_id),
  );

  const dow = weekdayIndex(date);
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
        ) : events.length === 0 && activities.length === 0 ? (
          <Empty
            message={`Nothing on ${dow === 5 || dow === 6 ? 'the weekend' : 'this day'}. Rest, or plan something with your coach.`}
            icon="moon-outline"
          />
        ) : (
          <>
            {events.map((e) => {
              const actual = activities.find((a) => a.paired_event_id === e.id);
              // V-05: visualize planned training sessions (WORKOUT / RACE_*);
              // notes/PLAN categories stay prose-only.
              const training =
                e.category == null || e.category === 'WORKOUT' || e.category.startsWith('RACE');
              return (
                <GlassCard key={`e${e.id ?? e.start_date_local}`}>
                  <View style={s.rowBetween}>
                    <Text style={s.name}>{e.name ?? 'Planned workout'}</Text>
                    {isRaceEvent(e) ? (
                      <Badge label={`RACE ${e.category?.slice(5) ?? ''}`} tone="race" icon="flag" />
                    ) : null}
                  </View>
                  <Text style={s.meta}>
                    {[timeLabel(e.start_date_local), eventLine(e), e.type].filter(Boolean).join(' · ')}
                  </Text>
                  {e.description && training ? <WorkoutTimeline description={e.description} /> : null}
                  {e.description ? <Text style={s.description}>{e.description}</Text> : null}
                  {actual ? <ActualBlock activity={actual} /> : null}
                </GlassCard>
              );
            })}
            {loneActivities.map((a) => (
              <GlassCard key={`a${a.id}`}>
                <View style={s.rowBetween}>
                  <Text style={s.name}>{a.name ?? 'Activity'}</Text>
                  <Badge label="recorded" tone="success" icon="checkmark" />
                </View>
                <Text style={s.meta}>
                  {[timeLabel(a.start_date_local), activityLine(a), a.source].filter(Boolean).join(' · ')}
                </Text>
                <ActualBlock activity={a} />
              </GlassCard>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ActualBlock({ activity }: { activity: Activity }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const zoneSeconds = zoneSecondsOf(activity);
  const total = Object.values(zoneSeconds).reduce((a, b) => a + b, 0);
  const zones = Object.entries(zoneSeconds)
    .filter(([, secs]) => secs >= 60)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <View style={s.actual}>
      <Text style={s.actualTitle}>Recorded</Text>
      <Text style={s.actualMeta}>{activityLine(activity)}</Text>
      {total > 0 ? (
        <>
          {/* FIX-4: proportional stacked bar, cool→hot by zone */}
          <View style={s.zoneBar}>
            {zones.map(([id, secs]) => (
              <View
                key={id}
                style={{ flexGrow: secs, backgroundColor: zoneColor(colors, id) }}
              />
            ))}
          </View>
          <View style={s.zoneLegend}>
            {zones.map(([id, secs]) => (
              <View key={id} style={s.zoneLegendItem}>
                <View style={[styles2.zoneSwatch, { backgroundColor: zoneColor(colors, id) }]} />
                <Text style={s.zoneLegendText}>
                  {id} {formatDuration(secs)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles2 = StyleSheet.create({
  zoneSwatch: { width: 8, height: 8, borderRadius: 4 },
});

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
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    body: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
      gap: spacing.md,
    },
    name: { color: p.text, fontSize: fontSize.h, fontWeight: '600', flexShrink: 1 },
    meta: { color: p.muted, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    description: {
      color: p.text,
      fontSize: fontSize.small + 1,
      lineHeight: 20,
      backgroundColor: p.bg,
      borderRadius: radius.md,
      padding: spacing.md,
      fontFamily: 'Menlo, monospace',
    },
    actual: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
      paddingTop: spacing.sm,
      gap: spacing.xs,
    },
    actualTitle: { color: p.accentText, fontSize: fontSize.tiny, fontWeight: '700', textTransform: 'uppercase' },
    actualMeta: { color: p.text, fontSize: fontSize.small },
    zoneBar: {
      flexDirection: 'row',
      height: 10,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: p.border,
      gap: 1,
      marginTop: spacing.xs,
    },
    zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    zoneLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    zoneLegendText: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
  });
