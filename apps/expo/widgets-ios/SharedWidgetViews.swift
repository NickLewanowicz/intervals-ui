// Shared timeline plumbing: every widget renders the same SnapshotEntry and
// gets the same two-entry timeline — now, plus one at the next midnight so
// countdowns/chips roll over without waiting for an app write. The bridge
// module calls WidgetCenter.reloadAllTimelines() on every snapshot write for
// the immediate refresh.

import SwiftUI
import WidgetKit

struct SnapshotEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct SnapshotProvider: TimelineProvider {
  /// Gallery preview — a real-looking card, clearly no live data required.
  func placeholder(in context: Context) -> SnapshotEntry {
    SnapshotEntry(date: Date(), snapshot: sampleSnapshot)
  }

  func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
    completion(SnapshotEntry(date: Date(), snapshot: SnapshotStore.load() ?? sampleSnapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
    let now = Date()
    let midnight = Calendar.current.startOfDay(for: now).addingTimeInterval(86_400)
    completion(Timeline(
      entries: [
        SnapshotEntry(date: now, snapshot: SnapshotStore.load()),
        SnapshotEntry(date: midnight, snapshot: SnapshotStore.load()),
      ],
      policy: .atEnd
    ))
  }
}

/// Whole-area tap-through to the calendar tab (the app's own scheme).
let widgetCalendarURL = URL(string: "intervals://calendar")!

/// The dark card — mirrors WidgetCard in src/widgets/common.tsx. The system
/// rounds the container; we only own the color and inner padding.
struct WidgetCardView<Content: View>: View {
  var padding: CGFloat = 12
  private var content: Content

  init(padding: CGFloat = 12, @ViewBuilder content: () -> Content) {
    self.padding = padding
    self.content = content()
  }

  var body: some View {
    content
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .padding(padding)
      .widgetBackground()
      .widgetURL(widgetCalendarURL)
  }
}

extension View {
  /// iOS 17+ API (widget target deploys 17.0; sim runtime is 26.x).
  func widgetBackground() -> some View {
    containerBackground(for: .widget) { W.card }
  }
}

/// Snapshot missing (app never opened / cleared): neutral, friendly state.
struct NoDataView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      WidgetCapsLabel(text: "intervals")
      Text("Open the app once to load your data.")
        .font(.system(size: 12))
        .foregroundStyle(W.muted)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }
}
