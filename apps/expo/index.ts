/**
 * App entry (round 16): the stock expo-router entry, plus registration of the
 * Android home-screen widget task handler. Registration must run at MODULE
 * scope (not inside a component) because the widget headless task evaluates
 * this bundle without ever rendering the app tree.
 *
 * The native-only widget graph is require()d — not imported — behind a
 * Platform guard: on web the bundle keeps the module but never evaluates it
 * (the lib's TurboModuleRegistry.getEnforcing throws at import time outside
 * React Native, which would break the static export).
 */
import { Platform } from 'react-native';
import 'expo-router/entry';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } =
    require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } = require('./widgets') as typeof import('./widgets');
  registerWidgetTaskHandler(widgetTaskHandler);
}
