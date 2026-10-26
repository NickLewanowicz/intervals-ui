/**
 * iOS WidgetKit bridge (round 17) — the native counterpart of the Android
 * AsyncStorage snapshot path. The WidgetSnapshotBridge Expo module (local
 * module in `modules/widget-snapshot-bridge/`, autolinked on iOS) writes the
 * snapshot JSON into the App Group (`group.com.anonymous.intervalscoach`
 * shared UserDefaults, key = WIDGET_SNAPSHOT_KEY) and calls
 * WidgetCenter.reloadAllTimelines() so placed widgets re-render immediately.
 *
 * Everything here is fail-soft: on web/Android (or if the module is missing)
 * the bridge resolves to null and the write is a no-op returning false.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { WidgetSnapshot } from './widget-data';

interface WidgetSnapshotBridgeModule {
  /** Write the snapshot JSON into the App Group; true on success. */
  write(json: string): boolean;
  /** WidgetCenter.reloadAllTimelines() — push a re-render to placed widgets. */
  reload(): void;
}

/** The App Group the WidgetKit extension reads from (keep in sync with
 *  tools/ios_widgets_setup.sh + the Swift side). */
export const IOS_WIDGET_APP_GROUP = 'group.com.anonymous.intervalscoach';

let cached: WidgetSnapshotBridgeModule | null | undefined;

function bridge(): WidgetSnapshotBridgeModule | null {
  if (cached === undefined) {
    cached =
      Platform.OS === 'ios'
        ? requireOptionalNativeModule<WidgetSnapshotBridgeModule>('WidgetSnapshotBridge')
        : null;
  }
  return cached ?? null;
}

/**
 * Mirror the snapshot into the App Group for the WidgetKit extension.
 * Never throws — a missing/failed bridge just means no widget refresh.
 */
export function writeIosWidgetSnapshot(snapshot: WidgetSnapshot): boolean {
  const b = bridge();
  if (!b) return false;
  try {
    return b.write(JSON.stringify(snapshot)) === true;
  } catch {
    return false;
  }
}

/** True when the native bridge exists (iOS build with the module linked). */
export function iosWidgetBridgeAvailable(): boolean {
  return bridge() != null;
}
