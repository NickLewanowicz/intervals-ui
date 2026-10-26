// intervals coach home-screen widgets (round 17) — the WidgetKit
// counterpart of the Android react-native-android-widget lineup
// (apps/expo/widgets.tsx). All three render offline-instant from the App
// Group snapshot written by WidgetSnapshotBridgeModule.

import SwiftUI
import WidgetKit

@main
struct IntervalscoachWidgetBundle: WidgetBundle {
  var body: some Widget {
    NextRaceWidget()
    UpcomingRunsWidget()
    FitnessWidget()
  }
}
