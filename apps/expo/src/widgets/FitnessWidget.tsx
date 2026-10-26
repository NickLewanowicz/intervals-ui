/**
 * FitnessWidget (round 19): a deliberate two-anatomy composition per owner
 * review — no more floating sparkline/dead space.
 *
 * Both variants use the app's StatTile anatomy (small-caps label + big value
 * + 7-day delta chip) and the today bar of the 14-day CTL sparkline in
 * accent. Widths are explicit; TILE heights come from explicit font sizes +
 * margins instead of fixed-height wrappers — under RemoteViews a TextView
 * measured inside an exact-height LinearLayout chain reports its height as
 * the bare font size, which clipped the delta-chip labels (round 19 finding).
 * - 2×2: FITNESS label, FORM tile, CTL/ATL tiles, sparkline anchored to the
 *   bottom with an explicit computed height (clamped so small launchers trim
 *   instead of overflowing).
 * - 4×2: left column (116dp) = FORM + CTL + ATL tiles, hairline divider,
 *   right column = sparkline filling the full height with "updated Xm ago"
 *   pinned bottom.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { snapshotAgeLabel, type WidgetFitness, type WidgetSnapshot } from '../lib/widget-data';
import { CtlBars, DeltaChip, WidgetCard, WidgetLabel, WidgetNoData, type WidgetProps } from './common';
import { widgetTheme as t } from './widget-theme';

/** form > 0 is freshness (success), < 0 fatigue (danger), 0 neutral. */
const formColor = (form: number) => (form > 0 ? t.success : form < 0 ? t.danger : t.text);

const clamp = (min: number, max: number, v: number) => Math.max(min, Math.min(max, v));

/** StatTile anatomy: small-caps label, big value, 7-day delta chip. */
function Metric({
  label,
  value,
  delta,
  goodUp,
  valueSize,
}: {
  label: string;
  value: number;
  delta: number | null;
  goodUp: boolean;
  valueSize: number;
}) {
  return (
    <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <WidgetLabel text={label} size={8.5} />
      <TextWidget
        text={String(Math.round(value))}
        style={{ fontSize: valueSize, fontWeight: '800', color: t.text, lineHeight: Math.round(valueSize * 1.2), marginTop: 1 }}
      />
      <DeltaChip value={delta} goodUp={goodUp} />
    </FlexWidget>
  );
}

/** FORM tile: small-caps label, direction-tinted value, muted band word. */
function FormTile({ fitness, valueSize }: { fitness: WidgetFitness; valueSize: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <WidgetLabel text="Form" size={8.5} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget
          text={String(Math.round(fitness.form))}
          style={{ fontSize: valueSize, fontWeight: '800', color: formColor(fitness.form), lineHeight: Math.round(valueSize * 1.2) }}
        />
        <TextWidget
          text={fitness.bandWord}
          style={{ fontSize: 10.5, fontWeight: '600', color: t.muted, marginLeft: 5 }}
          maxLines={1}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/** 1dp vertical hairline between the composition columns. */
function Hairline({ marginH }: { marginH: number }) {
  return (
    <FlexWidget
      style={{ width: 1, height: 'match_parent', backgroundColor: t.borderGlass, marginLeft: marginH, marginRight: marginH }}
    />
  );
}

function EmptyFitness({ width, height, padding }: WidgetProps & { padding: number }) {
  return (
    <WidgetCard width={width} height={height} padding={padding}>
      <WidgetLabel text="Fitness" size={9} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget
          text="Connect intervals.icu in the app."
          style={{ fontSize: 12, color: t.muted, lineHeight: 17 }}
          maxLines={2}
          truncate="END"
        />
      </FlexWidget>
    </WidgetCard>
  );
}

/** 2×2 tile stack: FORM on its own line, CTL/ATL side by side below. */
function TileStack({ fitness, compact }: { fitness: WidgetFitness; compact: boolean }) {
  const value = compact ? 16 : 20;
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
      <FormTile fitness={fitness} valueSize={compact ? 14 : 18} />
      <FlexWidget style={{ flexDirection: 'row', marginTop: compact ? 5 : 8 }}>
        <Metric label="CTL" value={fitness.ctl} delta={fitness.ctlDelta7} goodUp valueSize={value} />
        <FlexWidget style={{ width: compact ? 12 : 16 }} />
        <Metric label="ATL" value={fitness.atl} delta={fitness.atlDelta7} goodUp={false} valueSize={value} />
      </FlexWidget>
    </FlexWidget>
  );
}

/**
 * 2×2 square variant — vertical, everything full-width: FITNESS label, FORM
 * tile, CTL/ATL tiles, then the sparkline takes the exact remaining height
 * (clamped to [18, 72] so tiny launchers trim instead of overflowing).
 * Below 140dp a compact branch shrinks type + gaps to keep the sparkline
 * ≥ 14dp with no orphan gaps.
 */
export function FitnessWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} />;
  const f = snapshot.fitness;
  if (!f) return <EmptyFitness width={width} height={height} padding={12} />;

  const compact = height < 140;
  const pad = compact ? 10 : 12;
  // sparkline takes what the chrome + tiles leave: paddings + label + gaps +
  // a measured upper bound of the hugging tile stack (form ~34, tiles ~52)
  const barsH = compact ? clamp(14, 44, height - 118) : clamp(18, 72, height - 152);
  return (
    <WidgetCard width={width} height={height} padding={pad}>
      {compact ? null : <WidgetLabel text="Fitness" size={9} />}
      <FlexWidget style={{ flexDirection: 'row', marginTop: compact ? 6 : 10, marginBottom: compact ? 6 : 8 }}>
        <TileStack fitness={f} compact={compact} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1 }} />
      <CtlBars series={f.series} height={barsH} />
    </WidgetCard>
  );
}

/**
 * 4×2 wide variant — left column (116dp) = FORM/CTL/ATL StatTiles; hairline
 * divider; right column = 14-bar sparkline filling the full height with the
 * "updated" freshness line pinned bottom.
 */
export function FitnessWideWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} padding={12} />;
  const f = snapshot.fitness;
  if (!f) return <EmptyFitness width={width} height={height} padding={12} />;

  const pad = 12;
  const leftW = 116;
  const compact = height < 170;
  // right column: sparkline fills everything above the pinned updated line
  const barsH = Math.max(20, height - 2 * pad - 16);
  return (
    <WidgetCard width={width} height={height} padding={pad}>
      <FlexWidget style={{ flex: 1, flexDirection: 'row', width: 'match_parent' }}>
        <FlexWidget style={{ width: leftW, flexDirection: 'column', alignItems: 'flex-start' }}>
          <WidgetLabel text="Fitness" size={9} />
          <FlexWidget style={{ flexDirection: 'column', marginTop: compact ? 4 : 6, marginBottom: compact ? 4 : 6 }}>
            <FormTile fitness={f} valueSize={compact ? 16 : 20} />
          </FlexWidget>
          <FlexWidget style={{ flexDirection: 'column', marginBottom: compact ? 4 : 8 }}>
            <Metric label="CTL" value={f.ctl} delta={f.ctlDelta7} goodUp valueSize={compact ? 17 : 20} />
          </FlexWidget>
          <Metric label="ATL" value={f.atl} delta={f.atlDelta7} goodUp={false} valueSize={compact ? 17 : 20} />
        </FlexWidget>
        <Hairline marginH={12} />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'flex-end' }}>
          <CtlBars series={f.series} height={barsH} />
          <TextWidget
            text={snapshotAgeLabel(snapshot.writtenAt)}
            style={{ fontSize: 8.5, color: t.muted, marginTop: 5, lineHeight: 11 }}
            maxLines={1}
          />
        </FlexWidget>
      </FlexWidget>
    </WidgetCard>
  );
}
