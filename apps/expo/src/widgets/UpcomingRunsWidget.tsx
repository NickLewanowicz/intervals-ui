/**
 * UpcomingRunsWidget (round 16) — Google-Calendar-condensed: one row per run
 * for the days ahead, each with a left date chip (DOW + day number, today
 * accent-tinted), a planned ○ / done ✓ status marker, run name and one metric
 * line. Race rows use the reserved race tint. Height-adaptive: the same
 * component serves the 4×2 and 4×3 registrations (rows fit to the pixel
 * height the launcher reports).
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { snapshotAgeLabel, type WidgetSnapshot, type WidgetUpcomingEntry } from '../lib/widget-data';
import { WidgetCard, WidgetLabel, WidgetNoData, type WidgetProps } from './common';
import { widgetTheme as t } from './widget-theme';

const CHIP_W = 30;
const ROW_H = 30;
const HEADER_H = 15;

/** Left date chip: mono-feel DOW over the day number; today = accent fill. */
function DateChip({ row }: { row: WidgetUpcomingEntry }) {
  const fg = row.isToday ? t.onAccent : t.muted;
  return (
    <FlexWidget
      style={{
        width: CHIP_W,
        height: CHIP_W,
        borderRadius: 8,
        backgroundColor: row.isToday ? t.accent : t.borderGlass,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={row.dow.toUpperCase()} style={{ fontSize: 7.5, fontWeight: '700', color: fg, letterSpacing: 0.6 }} />
      <TextWidget text={String(row.day)} style={{ fontSize: 13, fontWeight: '700', color: fg, marginTop: -1 }} />
    </FlexWidget>
  );
}

function RunRow({ row }: { row: WidgetUpcomingEntry }) {
  const nameColor = row.isRace ? t.race : row.done ? t.mutedStrong : t.text;
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', height: ROW_H, width: 'match_parent' }}>
      <DateChip row={row} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', marginLeft: 8 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          {row.done ? (
            <TextWidget text="✓" style={{ fontSize: 10, fontWeight: '700', color: t.success, marginRight: 4 }} />
          ) : (
            <FlexWidget
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: row.isRace ? t.race : t.muted,
                marginRight: 4,
              }}
            />
          )}
          <TextWidget
            text={row.name}
            style={{ fontSize: 12, fontWeight: '700', color: nameColor }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
        <TextWidget
          text={row.metric}
          style={{ fontSize: 10, color: t.muted, marginTop: 1 }}
          maxLines={1}
          truncate="END"
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/** 4×2 and 4×3 variants (registered as UpcomingRuns / UpcomingRunsTall). */
export function UpcomingRunsWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} padding={10} />;
  const rows = snapshot.upcoming;
  const rowsFit = Math.max(
    1,
    Math.floor((height - 2 * 10 - HEADER_H - 4) / ROW_H),
  );
  const shown = rows.slice(0, rowsFit);
  return (
    <WidgetCard width={width} height={height} padding={10}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: HEADER_H, width: 'match_parent' }}>
        <WidgetLabel text="Upcoming" size={9} />
        <TextWidget
          text={snapshotAgeLabel(snapshot.writtenAt)}
          style={{ fontSize: 8.5, color: t.muted }}
        />
      </FlexWidget>
      {shown.length === 0 ? (
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <TextWidget
            text="Nothing scheduled — enjoy the rest."
            style={{ fontSize: 12, color: t.muted }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'flex-start', marginTop: 4 }}>
          {shown.map((row) => (
            <RunRow key={`${row.date}:${row.name}:${row.metric}`} row={row} />
          ))}
        </FlexWidget>
      )}
    </WidgetCard>
  );
}
