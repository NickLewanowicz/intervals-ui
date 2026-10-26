// UpcomingRunsWidget (round 17) — SwiftUI port of
// src/widgets/UpcomingRunsWidget.tsx: up to 5 run rows, each a left date chip
// (DOW + day, today accent-filled), a planned ○ / done ✓ marker, run name and
// one metric line. Race rows use the reserved race tint. Families: medium
// (4×2) + large (4×4, Android's taller registration).

import SwiftUI
import WidgetKit

/// Left date chip: DOW over the day number; today = accent fill.
private struct DateChip: View {
  let row: WidgetSnapshot.UpcomingEntry
  let today: String
  var size: CGFloat = 30

  var body: some View {
    let isToday = row.date == today
    let fg = isToday ? W.onAccent : W.muted
    VStack(spacing: 0) {
      Text(row.dow.uppercased())
        .font(.system(size: 7.5, weight: .bold))
        .tracking(0.6)
        .foregroundStyle(fg)
      Text("\(row.day)")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(fg)
    }
    .frame(width: size, height: size)
    .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(isToday ? W.accent : W.borderGlass))
  }
}

private struct RunRow: View {
  let row: WidgetSnapshot.UpcomingEntry
  let today: String

  var body: some View {
    HStack(alignment: .center, spacing: 8) {
      DateChip(row: row, today: today)
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 4) {
          if row.done {
            Text("✓").font(.system(size: 10, weight: .bold)).foregroundStyle(W.success)
          } else {
            Circle()
              .stroke(row.isRace ? W.race : W.muted, lineWidth: 1.5)
              .frame(width: 7, height: 7)
          }
          Text(row.name)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(row.isRace ? W.race : (row.done ? W.mutedStrong : W.text))
            .lineLimit(1)
        }
        Text(row.metric)
          .font(.system(size: 10))
          .foregroundStyle(W.muted)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
  }
}

struct UpcomingRunsView: View {
  let entry: SnapshotEntry
  @Environment(\.widgetFamily) private var family

  private var maxRows: Int {
    // parity with Android: 5 rows max; the medium leaves room for 3
    family == .systemLarge ? 5 : 3
  }

  var body: some View {
    WidgetCardView(padding: 10) {
      if let snap = entry.snapshot {
        VStack(alignment: .leading, spacing: 0) {
          HStack {
            WidgetCapsLabel(text: "Upcoming", size: 9)
            Spacer()
            Text(snapshotAgeLabel(snap.writtenAt, at: entry.date))
              .font(.system(size: 8.5))
              .foregroundStyle(W.muted)
          }
          .frame(height: 15)
          if snap.upcoming.isEmpty {
            Spacer(minLength: 0)
            Text("Nothing scheduled — enjoy the rest.")
              .font(.system(size: 12))
              .foregroundStyle(W.muted)
              .frame(maxWidth: .infinity, alignment: .center)
            Spacer(minLength: 0)
          } else {
            VStack(alignment: .leading, spacing: 0) {
              ForEach(Array(snap.upcoming.prefix(maxRows).enumerated()), id: \.offset) { _, row in
                RunRow(row: row, today: isoToday(entry.date))
                  .padding(.top, 4)
              }
            }
            Spacer(minLength: 0)
          }
        }
      } else {
        NoDataView()
      }
    }
  }
}

struct UpcomingRunsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "upcoming-runs", provider: SnapshotProvider()) { entry in
      UpcomingRunsView(entry: entry)
    }
    .configurationDisplayName("Upcoming Runs")
    .description("Your planned and completed runs for the next two weeks.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
