// NextRaceWidget (round 17) — SwiftUI port of src/widgets/NextRaceWidget.tsx:
// small-caps NEXT RACE label, race name, big countdown ("21 DAYS" /
// "TOMORROW" / "TODAY", race-tinted when imminent) and a small-caps date
// line. Families: small (2×2) + medium (4×2 wide variant).

import SwiftUI
import WidgetKit

struct NextRaceView: View {
  let entry: SnapshotEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    WidgetCardView {
      if let race = entry.snapshot?.nextRace {
        if family == .systemMedium {
          wide(race)
        } else {
          square(race, at: entry.date)
        }
      } else if entry.snapshot != nil {
        empty
      } else {
        NoDataView()
      }
    }
  }

  /// 2×2: label / name stacked top, countdown + date pinned to the bottom.
  private func square(_ race: WidgetSnapshot.NextRace, at date: Date) -> some View {
    let countdown = raceCountdownLabel(liveDaysUntil(race, at: date))
    return VStack(alignment: .leading, spacing: 0) {
      WidgetCapsLabel(text: "Next race")
      Text(race.name)
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(W.text)
        .lineLimit(2)
        .padding(.top, 5)
      Spacer(minLength: 0)
      Text(countdown)
        .font(.system(size: countdown.count > 6 ? 22 : 26, weight: .heavy))
        .foregroundStyle(liveDaysUntil(race, at: date) <= 1 ? W.race : W.text)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      Text(raceDateLine(race.date, race.time))
        .font(.system(size: 10.5, weight: .semibold))
        .tracking(0.8)
        .foregroundStyle(W.muted)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .padding(.top, 3)
    }
  }

  /// 4×1-style wide: name left, countdown + date right.
  private func wide(_ race: WidgetSnapshot.NextRace) -> some View {
    let days = liveDaysUntil(race, at: entry.date)
    let countdown = raceCountdownLabel(days)
    return HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        WidgetCapsLabel(text: "Next race", size: 8)
        Text(race.name)
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(W.text)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      VStack(alignment: .trailing, spacing: 1) {
        Text(countdown)
          .font(.system(size: countdown.count > 6 ? 15 : 19, weight: .heavy))
          .foregroundStyle(days <= 1 ? W.race : W.text)
          .lineLimit(1)
          .minimumScaleFactor(0.6)
        Text(raceDateLine(race.date, race.time))
          .font(.system(size: 9.5, weight: .semibold))
          .tracking(0.7)
          .foregroundStyle(W.muted)
          .lineLimit(1)
          .minimumScaleFactor(0.6)
      }
    }
  }

  /// A no-races state that stays friendly ("ask your coach", per round 16).
  private var empty: some View {
    VStack(alignment: .leading, spacing: 0) {
      WidgetCapsLabel(text: "Next race")
      Text("No races on the calendar — ask your coach to add one.")
        .font(.system(size: 12))
        .foregroundStyle(W.muted)
        .lineLimit(3)
        .padding(.top, 6)
      Spacer(minLength: 0)
    }
  }
}

struct NextRaceWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "next-race", provider: SnapshotProvider()) { entry in
      NextRaceView(entry: entry)
    }
    .configurationDisplayName("Next Race")
    .description("Countdown to your next A/B/C race on the calendar.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
