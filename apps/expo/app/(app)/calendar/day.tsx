/**
 * Day detail (pushed from the calendar): full event description, recorded
 * actuals, zone times.
 */
import { buildDayCells, formatZoneSeconds, isRaceEvent } from '@intervals/core';
import { Link, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge, Card, Empty, ErrorBox, Loading } from '@/components/ui';
import { MONTHS, dayLabel, isValidISO, timeLabel, todayISO, weekdayIndex } from '@/lib/dates';
import { activityLine, eventLine, zoneSecondsOf } from '@/lib/format';
import { useCalendarWindow } from '@/lib/queries';
import { colors, fontSize, spacing } from '@/theme';
import type { Activity } from '@intervals/core';

export default function DayScreen() {
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
    <View style={styles.page}>
      <View style={styles.header}>
        <Link href="/calendar" replace>
          <Text style={styles.back}>← Calendar</Text>
        </Link>
        <Text style={styles.title}>{fullLabel}</Text>
        {date === todayISO() ? <Badge label="today" tone="accent" /> : null}
      </View>
      <View style={styles.body}>
        {isLoading ? (
          <Loading label="Loading day…" />
        ) : isError ? (
          <ErrorBox message={`Could not load day: ${(error as Error)?.message ?? 'error'}`} />
        ) : events.length === 0 && activities.length === 0 ? (
          <Empty message={`Nothing on ${dow === 5 || dow === 6 ? 'the weekend' : 'this day'}. Rest, or plan something with your coach.`} />
        ) : (
          <>
            {events.map((e) => {
              const actual = activities.find((a) => a.paired_event_id === e.id);
              return (
                <Card key={`e${e.id ?? e.start_date_local}`}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.name}>{e.name ?? 'Planned workout'}</Text>
                    {isRaceEvent(e) ? <Badge label={`RACE ${e.category?.slice(5)}`} tone="danger" /> : null}
                  </View>
                  <Text style={styles.meta}>
                    {[timeLabel(e.start_date_local), eventLine(e), e.type].filter(Boolean).join(' · ')}
                  </Text>
                  {e.description ? <Text style={styles.description}>{e.description}</Text> : null}
                  {actual ? <ActualBlock activity={actual} /> : null}
                </Card>
              );
            })}
            {loneActivities.map((a) => (
              <Card key={`a${a.id}`}>
                <Text style={styles.name}>✓ {a.name ?? 'Activity'}</Text>
                <Text style={styles.meta}>
                  {[timeLabel(a.start_date_local), activityLine(a), a.source].filter(Boolean).join(' · ')}
                </Text>
                <ActualBlock activity={a} />
              </Card>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

function ActualBlock({ activity }: { activity: Activity }) {
  const zones = formatZoneSeconds(zoneSecondsOf(activity));
  return (
    <View style={styles.actual}>
      <Text style={styles.actualTitle}>Recorded</Text>
      <Text style={styles.actualMeta}>{activityLine(activity)}</Text>
      {zones ? <Text style={styles.actualZones}>{zones}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  back: { color: colors.muted, fontSize: fontSize.small },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  body: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  name: { color: colors.text, fontSize: fontSize.h, fontWeight: '600', flexShrink: 1 },
  meta: { color: colors.muted, fontSize: fontSize.small },
  description: {
    color: colors.text,
    fontSize: fontSize.small + 1,
    lineHeight: 20,
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: spacing.md,
  },
  actual: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  actualTitle: { color: colors.accent, fontSize: fontSize.tiny, fontWeight: '700', textTransform: 'uppercase' },
  actualMeta: { color: colors.text, fontSize: fontSize.small },
  actualZones: { color: colors.muted, fontSize: fontSize.small },
});
