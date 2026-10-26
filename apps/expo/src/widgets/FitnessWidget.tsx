/**
 * FitnessWidget (round 16): CTL (fitness) and ATL (fatigue) big values with
 * 7-day delta chips, FORM (ctl−atl) with its Coggan band word, and a 14-day
 * CTL bar sparkline (plain Views — no SVG exists in widget land; today's bar
 * is accent). The 4×2 variant moves the sparkline into a right column and
 * gains the "updated Xm ago" freshness line.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { snapshotAgeLabel, type WidgetFitness, type WidgetSnapshot } from '../lib/widget-data';
import { CtlBars, DeltaChip, WidgetCard, WidgetLabel, WidgetNoData, type WidgetProps } from './common';
import { widgetTheme as t } from './widget-theme';

/** form > 0 is freshness (success), < 0 fatigue (danger), 0 neutral. */
const formColor = (form: number) => (form > 0 ? t.success : form < 0 ? t.danger : t.text);

/** One big value column: value + small-caps label + 7d delta chip. */
function Metric({
  label,
  value,
  delta,
  goodUp,
}: {
  label: string;
  value: number;
  delta: number | null;
  goodUp: boolean;
}) {
  return (
    <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
      <TextWidget text={String(Math.round(value))} style={{ fontSize: 24, fontWeight: '800', color: t.text }} />
      <WidgetLabel text={label} size={8.5} />
      <DeltaChip value={delta} goodUp={goodUp} />
    </FlexWidget>
  );
}

/** "FORM 5 fresh" line, form value tinted by direction, band word muted. */
function FormLine({ fitness }: { fitness: WidgetFitness }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
      <WidgetLabel text="Form" size={8.5} />
      <TextWidget
        text={String(Math.round(fitness.form))}
        style={{ fontSize: 14, fontWeight: '800', color: formColor(fitness.form), marginLeft: 5 }}
      />
      <TextWidget
        text={fitness.bandWord}
        style={{ fontSize: 10.5, fontWeight: '600', color: t.muted, marginLeft: 4 }}
        maxLines={1}
      />
    </FlexWidget>
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

/** 2×2 square variant: metrics stacked over a bottom-anchored sparkline. */
export function FitnessWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} />;
  const f = snapshot.fitness;
  if (!f) return <EmptyFitness width={width} height={height} padding={12} />;

  return (
    <WidgetCard width={width} height={height} padding={12}>
      <WidgetLabel text="Fitness" size={9} />
      <FlexWidget style={{ flexDirection: 'row', marginTop: 6 }}>
        <Metric label="CTL" value={f.ctl} delta={f.ctlDelta7} goodUp />
        <FlexWidget style={{ width: 18 }} />
        <Metric label="ATL" value={f.atl} delta={f.atlDelta7} goodUp={false} />
      </FlexWidget>
      <FormLine fitness={f} />
      <FlexWidget style={{ flex: 1 }} />
      <CtlBars series={f.series} height={26} />
    </WidgetCard>
  );
}

/** 4×2 wide variant: metrics left, tall sparkline right, freshness line. */
export function FitnessWideWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} padding={10} />;
  const f = snapshot.fitness;
  if (!f) return <EmptyFitness width={width} height={height} padding={10} />;

  return (
    <WidgetCard width={width} height={height} padding={10}>
      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', width: 'match_parent' }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <WidgetLabel text="Fitness" size={9} />
          <FlexWidget style={{ flexDirection: 'row', marginTop: 5 }}>
            <Metric label="CTL" value={f.ctl} delta={f.ctlDelta7} goodUp />
            <FlexWidget style={{ width: 16 }} />
            <Metric label="ATL" value={f.atl} delta={f.atlDelta7} goodUp={false} />
          </FlexWidget>
          <FormLine fitness={f} />
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }} />
        <FlexWidget style={{ flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end', height: 'match_parent' }}>
          <FlexWidget style={{ flex: 1 }} />
          <FlexWidget style={{ width: 96 }}>
            <CtlBars series={f.series} height={44} />
          </FlexWidget>
          <TextWidget
            text={snapshotAgeLabel(snapshot.writtenAt)}
            style={{ fontSize: 8.5, color: t.muted, marginTop: 4 }}
          />
        </FlexWidget>
      </FlexWidget>
    </WidgetCard>
  );
}
