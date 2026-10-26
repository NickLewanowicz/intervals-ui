/**
 * NextRaceWidget (round 16): small-caps NEXT RACE label, race name, big
 * countdown ("21 DAYS" / "TOMORROW" / "TODAY") and a small-caps date line.
 * Renders only from the AsyncStorage snapshot — instant + offline.
 */
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { raceCountdownLabel, raceDateLine, type WidgetSnapshot } from '../lib/widget-data';
import { WidgetCard, WidgetLabel, WidgetNoData, type WidgetProps } from './common';
import { widgetTheme as t } from './widget-theme';

/** A no-races state that stays friendly ("ask your coach" per round-16 spec). */
function NextRaceEmpty({ width, height, padding, centered }: WidgetProps & { padding: number; centered?: boolean }) {
  return (
    <WidgetCard width={width} height={height} padding={padding}>
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          justifyContent: centered ? 'center' : 'flex-start',
          alignItems: centered ? 'center' : 'flex-start',
        }}
      >
        <WidgetLabel text="Next race" size={9} />
        <TextWidget
          text="No races on the calendar — ask your coach to add one."
          style={{ fontSize: 12, color: t.muted, marginTop: 6, lineHeight: 17 }}
          maxLines={3}
          truncate="END"
        />
      </FlexWidget>
    </WidgetCard>
  );
}

/** 2×2 square variant. */
export function NextRaceWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} />;
  const race = snapshot.nextRace;
  if (!race) return <NextRaceEmpty width={width} height={height} padding={12} />;

  const countdown = raceCountdownLabel(race.daysUntil);
  const todayOrTomorrow = race.daysUntil <= 1;
  const countdownSize = countdown.length > 6 ? 22 : 26;
  return (
    <WidgetCard width={width} height={height} padding={13}>
      <WidgetLabel text="Next race" size={9} />
      <TextWidget
        text={race.name}
        style={{ fontSize: 15, fontWeight: '700', color: t.text, marginTop: 5, lineHeight: 19 }}
        maxLines={2}
        truncate="END"
      />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget
        text={countdown}
        style={{
          fontSize: countdownSize,
          fontWeight: '800',
          color: todayOrTomorrow ? t.race : t.text,
          letterSpacing: 0.5,
        }}
        maxLines={1}
        truncate="END"
      />
      <TextWidget
        text={raceDateLine(race.date, race.time)}
        style={{ fontSize: 10.5, fontWeight: '600', color: t.muted, letterSpacing: 0.8, marginTop: 3 }}
        maxLines={1}
        truncate="END"
      />
    </WidgetCard>
  );
}

/** 4×1 wide variant: name left, countdown + date right. */
export function NextRaceWideWidget({
  width,
  height,
  snapshot,
}: WidgetProps & { snapshot: WidgetSnapshot | null }) {
  if (!snapshot) return <WidgetNoData width={width} height={height} padding={10} />;
  const race = snapshot.nextRace;
  if (!race) return <NextRaceEmpty width={width} height={height} padding={10} />;

  const countdown = raceCountdownLabel(race.daysUntil);
  const todayOrTomorrow = race.daysUntil <= 1;
  return (
    <WidgetCard width={width} height={height} padding={10}>
      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <WidgetLabel text="Next race" size={8} />
          <TextWidget
            text={race.name}
            style={{ fontSize: 14, fontWeight: '700', color: t.text, marginTop: 2 }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end', marginLeft: 8 }}>
          <TextWidget
            text={countdown}
            style={{
              fontSize: countdown.length > 6 ? 15 : 19,
              fontWeight: '800',
              color: todayOrTomorrow ? t.race : t.text,
              letterSpacing: 0.5,
            }}
            maxLines={1}
            truncate="END"
          />
          <TextWidget
            text={raceDateLine(race.date, race.time)}
            style={{ fontSize: 9.5, fontWeight: '600', color: t.muted, letterSpacing: 0.7, marginTop: 1 }}
            maxLines={1}
            truncate="END"
          />
        </FlexWidget>
      </FlexWidget>
    </WidgetCard>
  );
}
