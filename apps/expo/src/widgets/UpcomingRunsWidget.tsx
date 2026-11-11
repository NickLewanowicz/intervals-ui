/**
 * UpcomingRunsWidget (round 24) — Google-Calendar-condensed, re-spaced again
 * after the owner's "minimal padding" complaint: rows went from a 40dp
 * stride (32 + 8 gap) to 46dp (34 content + 12 gap), card edge padding from
 * 10dp to 12dp, and the header got its own 10dp separation. The 34×34 chip
 * matches the two-line text block exactly (17 + 3 + 14), keeping chip and
 * text baselines aligned.
 *
 * Status reads at a glance: DONE = ✓ + success-tinted chip with actual
 * metrics ("8.4km · 48m (planned 50m)"); MISSED = "–" + ghosted chip;
 * PLANNED = ○; today keeps the accent fill; races the reserved race tint.
 * Height-adaptive: the same component serves the 4×2 and 4×3 registrations
 * (rows fit to the pixel height the launcher reports).
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { snapshotAgeLabel, type WidgetSnapshot, type WidgetUpcomingEntry } from '../lib/widget-data';
import { WidgetCard, WidgetLabel, WidgetNoData, type WidgetProps } from './common';
import { widgetTheme as t } from './widget-theme';

const PAD = 12;
const HEADER_H = 16;
const HEADER_GAP = 10;
const ROW_H = 34;
const ROW_GAP = 12;
const ROW_STRIDE = ROW_H + ROW_GAP;
const CHIP_W = 34;

/** Left date chip: mono-feel DOW over the day number; today = accent fill,
 *  done = success-tinted, planned/missed keep the glass fill. */
function DateChip({ row }: { row: WidgetUpcomingEntry }) {
  const bg = row.isToday ? t.accent : row.done ? t.successSoft : t.borderGlass;
  const fg = row.isToday ? t.onAccent : row.done ? t.success : t.muted;
  return (
      <FlexWidget
      style={{
        width: CHIP_W,
        height: CHIP_W,
        borderRadius: 9,
        backgroundColor: bg,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <TextWidget text={row.dow.toUpperCase()} style={{ fontSize: 8, fontWeight: '700', color: fg, letterSpacing: 0.6 }} />
      <TextWidget text={String(row.day)} style={{ fontSize: 13.5, fontWeight: '700', color: fg, marginTop: -1 }} />
    </FlexWidget>
  );
}

function RunRow({ row }: { row: WidgetUpcomingEntry }) {
  const nameColor = row.isRace ? t.race : row.done ? t.mutedStrong : row.missed ? t.muted : t.text;
  return (
    <FlexWidget
      style={{ flexDirection: 'row', alignItems: 'center', height: ROW_H, width: 'match_parent', marginBottom: ROW_GAP }}
    >
      <DateChip row={row} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', marginLeft: 12 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', height: 17 }}>
          {row.done ? (
            <TextWidget text="✓" style={{ fontSize: 11, fontWeight: '700', color: t.success, marginRight: 6 }} />
          ) : row.missed ? (
            <TextWidget text="–" style={{ fontSize: 11, fontWeight: '700', color: t.muted, marginRight: 6 }} />
          ) : (
            <FlexWidget
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: row.isRace ? t.race : t.muted,
                marginRight: 6,
              }}
            />
          )}
          <TextWidget
            text={row.name}
            style={{ fontSize: 12.5, fontWeight: '700', color: nameColor, lineHeight: 17 }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
        <TextWidget
          text={row.metric}
          style={{ fontSize: 10.5, color: t.muted, lineHeight: 14, marginTop: 3 }}
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
  if (!snapshot) return <WidgetNoData width={width} height={height} padding={PAD} />;
  const rows = snapshot.upcoming;
  const rowsFit = Math.max(1, Math.floor((height - 2 * PAD - HEADER_H - HEADER_GAP) / ROW_STRIDE));
  const shown = rows.slice(0, rowsFit);
  return (
    <WidgetCard width={width} height={height} padding={PAD}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: HEADER_H,
          width: 'match_parent',
        }}
      >
        <WidgetLabel text="Upcoming" size={9} />
        <TextWidget text={snapshotAgeLabel(snapshot.writtenAt)} style={{ fontSize: 8.5, color: t.muted }} />
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
        <FlexWidget style={{ flexDirection: 'column', justifyContent: 'flex-start', marginTop: HEADER_GAP, width: 'match_parent' }}>
          {shown.map((row) => (
            <RunRow key={`${row.date}:${row.name}:${row.metric}`} row={row} />
          ))}
        </FlexWidget>
      )}
    </WidgetCard>
  );
}
