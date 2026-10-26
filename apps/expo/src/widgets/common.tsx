/**
 * Shared widget primitives (round 16). Built ONLY from
 * react-native-android-widget primitives + widget-theme tokens — the app's
 * View/Text/StyleSheet do not exist in the headless widget render context.
 */
import React from 'react';
import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import { WIDGET_CALENDAR_URI } from '../lib/widget-data';
import { widgetTheme as t } from './widget-theme';

export interface WidgetProps {
  width: number;
  height: number;
}

/** A muted small-caps label (uppercase text — real small-caps don't exist here). */
export function WidgetLabel({ text, color = t.muted, size = 10 }: { text: string; color?: ColorProp; size?: number }) {
  return (
    <TextWidget
      text={text.toUpperCase()}
      style={{ fontSize: size, fontWeight: '600', color, letterSpacing: 1.1 }}
    />
  );
}

/**
 * The widget card: dark surface, rounded, whole area taps through to the
 * calendar tab (OPEN_URI is handled natively by the lib — no JS round trip).
 */
export function WidgetCard({
  width,
  height,
  padding = 12,
  children,
}: WidgetProps & { padding?: number; children: React.ReactNode }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: WIDGET_CALENDAR_URI }}
      accessibilityLabel="intervals coach — open calendar"
      style={{
        width,
        height,
        backgroundColor: t.card,
        borderRadius: 18,
        padding,
        flexDirection: 'column',
        justifyContent: 'flex-start',
        overflow: 'hidden',
      }}
    >
      {children}
    </FlexWidget>
  );
}

/** Snapshot missing (app never opened / cleared): neutral, friendly state. */
export function WidgetNoData({ width, height, padding = 12 }: WidgetProps & { padding?: number }) {
  return (
    <WidgetCard width={width} height={height} padding={padding}>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
        <WidgetLabel text="intervals" size={9} />
        <TextWidget
          text="Open the app once to load your data."
          style={{ fontSize: 12, color: t.muted, marginTop: 4 }}
          maxLines={2}
          truncate="END"
        />
      </FlexWidget>
    </WidgetCard>
  );
}

/** Direction-tinted 7-day delta chip ("+2.1"); renders nothing for null.
 *  Round-16 recipe, unchanged: the pill HUGS its label — bordered/pill
 *  FlexWidgets with explicit sizes + lineHeight'd labels clip text under
 *  RemoteViews (LinearLayout) measurement, so no fixed box here. */
export function DeltaChip({ value, goodUp }: { value: number | null; goodUp: boolean }) {
  if (value == null) return null;
  const color = value === 0 ? t.muted : (value > 0) === goodUp ? t.success : t.danger;
  const label = `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: t.borderGlass,
        borderRadius: 999,
        paddingHorizontal: 5,
        paddingVertical: 1,
        marginTop: 2,
      }}
    >
      <TextWidget text={label} style={{ fontSize: 9, fontWeight: '700', color }} />
    </FlexWidget>
  );
}

/** 14-slot CTL bar sparkline from small Views (no SVG in widget land). */
export function CtlBars({ series, height }: { series: Array<{ date: string; ctl: number | null }>; height: number }) {
  const vals = series.map((s) => s.ctl).filter((v): v is number => v != null);
  const max = vals.length > 0 ? Math.max(...vals) : 0;
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height,
        width: 'match_parent',
      }}
    >
      {series.map((s, i) => {
        if (s.ctl == null || max <= 0) return <FlexWidget key={s.date} style={{ flex: 1 }} />;
        const h = Math.max(2, Math.round((s.ctl / max) * height));
        return (
          <FlexWidget
            key={s.date}
            style={{
              flex: 1,
              height: h,
              backgroundColor: i === series.length - 1 ? t.accent : t.borderStrong,
              borderRadius: 1.5,
              marginHorizontal: 1,
            }}
          />
        );
      })}
    </FlexWidget>
  );
}
