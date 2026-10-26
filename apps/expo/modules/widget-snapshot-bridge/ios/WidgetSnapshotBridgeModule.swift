import ExpoModulesCore
import WidgetKit

/// Round-17 bridge between the RN snapshot writer (widget-ios.ts) and the
/// WidgetKit extension. One job: put the snapshot JSON where the extension
/// can read it (App Group shared UserDefaults) and push the timelines.
public class WidgetSnapshotBridgeModule: Module {
  /// MUST match IOS_WIDGET_APP_GROUP in src/lib/widget-ios.ts and the
  /// entitlements written by tools/ios_widgets_setup.sh.
  static let appGroupId = "group.com.anonymous.intervalscoach"
  /// MUST match WIDGET_SNAPSHOT_KEY in src/lib/widget-data.ts — the Android
  /// widgets read AsyncStorage under the same key.
  static let snapshotKey = "widget.snapshot.v1"

  public func definition() -> ModuleDefinition {
    Name("WidgetSnapshotBridge")

    // sync on purpose: the RN side fire-and-forgets a fireproof one-liner
    Function("write") { (json: String) -> Bool in
      guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return false }
      defaults.set(json, forKey: Self.snapshotKey)
      WidgetCenter.shared.reloadAllTimelines()
      return true
    }

    Function("reload") {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
