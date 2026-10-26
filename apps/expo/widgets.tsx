/**
 * Android home-screen widget registration (round 16).
 *
 * The react-native-android-widget headless task ("RNWidgetBackgroundTask")
 * dispatches here for every WIDGET_ADDED / WIDGET_UPDATE / WIDGET_RESIZED /
 * WIDGET_CLICK of a registered widget. Rendering is instant + offline: the
 * handler reads ONLY the AsyncStorage snapshot (src/lib/widget-data.ts) and
 * draws. Clicks never land here — widgets set clickAction="OPEN_URI"
 * intervals://calendar, which the native side resolves without JS.
 *
 * ANDROID-ONLY GRAPH: this module is require()d from index.ts behind a
 * Platform guard — the lib's native module throws when evaluated on web.
 *
 * Widget metadata (names, picker labels, sizes, 30-min update period) lives
 * in the config-plugin options in app.json; names here MUST stay in sync.
 */
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readWidgetSnapshot, type WidgetSnapshot } from './src/lib/widget-data';
import { FitnessWidget, FitnessWideWidget } from './src/widgets/FitnessWidget';
import { NextRaceWidget, NextRaceWideWidget } from './src/widgets/NextRaceWidget';
import { UpcomingRunsWidget } from './src/widgets/UpcomingRunsWidget';
import { type WidgetProps } from './src/widgets/common';

type VariantComponent = React.ComponentType<WidgetProps & { snapshot: WidgetSnapshot | null }>;

/** app.json widget name → component (variant sizes per registration). */
const nameToWidget: Record<string, VariantComponent> = {
  NextRace: NextRaceWidget, // 2×2
  NextRaceWide: NextRaceWideWidget, // 4×1
  UpcomingRuns: UpcomingRunsWidget, // 4×2
  UpcomingRunsTall: UpcomingRunsWidget, // 4×3 (height-adaptive rows)
  Fitness: FitnessWidget, // 2×2
  FitnessWide: FitnessWideWidget, // 4×2
};

/** All registered widget names (keep in sync with app.json). */
export const WIDGET_NAMES = Object.keys(nameToWidget);

/** The element for one widget — shared by the task handler and the app-side refresh. */
export function renderWidgetByName(
  widgetName: string,
  width: number,
  height: number,
  snapshot: WidgetSnapshot | null,
): React.JSX.Element | null {
  const Widget = nameToWidget[widgetName];
  if (!Widget) return null;
  // launcher-reported dp sizes — the layouts compute all heights from these
  console.log(`[widget] render ${widgetName} ${width}x${height}`);
  return <Widget width={width} height={height} snapshot={snapshot} />;
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const { widgetInfo, widgetAction } = props;
  if (widgetAction === 'WIDGET_DELETED') return;
  const snapshot = await readWidgetSnapshot();
  const element = renderWidgetByName(widgetInfo.widgetName, widgetInfo.width, widgetInfo.height, snapshot);
  if (element) props.renderWidget(element);
}
