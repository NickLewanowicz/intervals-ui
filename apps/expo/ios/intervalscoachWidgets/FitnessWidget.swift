// FitnessWidget (round 17) — SwiftUI port of src/widgets/FitnessWidget.tsx:
// CTL (fitness) / ATL (fatigue) big values with 7-day delta chips, FORM
// (ctl−atl) with its Coggan band word, and a 14-day CTL bar sparkline (plain
// capsules — today's bar accent). Families: small (2×2) + medium (4×2 wide,
// sparkline right + freshness line).

import SwiftUI
import WidgetKit

/// form > 0 is freshness (success), < 0 fatigue (danger), 0 neutral.
private func formColor(_ form: Double) -> Color {
  form > 0 ? W.success : (form < 0 ? W.danger : W.text)
}

/// One big value column: value + small-caps label + 7d delta chip.
private struct Metric: View {
  let label: String
  let value: Double
  let delta: Double?
  let goodUp: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("\(Int(value.rounded()))")
        .font(.system(size: 24, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(W.text)
      WidgetCapsLabel(text: label, size: 8.5)
      if let d = deltaLabel(delta) {
        let color = d == "+0.0" || d == "-0.0" || d == "0.0"
          ? W.muted
          : ((delta! > 0) == goodUp ? W.success : W.danger)
        Text(d)
          .font(.system(size: 9, weight: .bold))
          .monospacedDigit()
          .foregroundStyle(color)
          .padding(.horizontal, 5)
          .padding(.vertical, 1)
          .overlay(Capsule().stroke(W.borderGlass, lineWidth: 1))
      }
    }
  }
}

/// "FORM 5 fresh" line, form value tinted by direction, band word muted.
private struct FormLine: View {
  let fitness: WidgetSnapshot.Fitness

  var body: some View {
    HStack(spacing: 5) {
      WidgetCapsLabel(text: "Form", size: 8.5)
      Text("\(Int(fitness.form.rounded()))")
        .font(.system(size: 14, weight: .heavy))
        .monospacedDigit()
        .foregroundStyle(formColor(fitness.form))
      Text(fitness.bandWord)
        .font(.system(size: 10.5, weight: .semibold))
        .foregroundStyle(W.muted)
        .lineLimit(1)
    }
  }
}

/// 14-slot CTL bar sparkline; null slots are gaps, last bar accent.
private struct CtlBars: View {
  let series: [WidgetSnapshot.Fitness.SeriesPoint]
  var height: CGFloat = 26

  var body: some View {
    let vals = series.compactMap(\.ctl)
    let maxVal = vals.max() ?? 0
    return HStack(alignment: .bottom, spacing: 2) {
      ForEach(Array(series.enumerated()), id: \.offset) { i, point in
        if let ctl = point.ctl, maxVal > 0 {
          Capsule()
            .fill(i == series.count - 1 ? W.accent : W.borderStrong)
            .frame(height: max(2, (ctl / maxVal) * height))
        } else {
          Color.clear.frame(height: 2)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .bottom)
    .frame(height: height, alignment: .bottom)
  }
}

private struct FitnessBody: View {
  let fitness: WidgetSnapshot.Fitness

  var body: some View {
    HStack(alignment: .top, spacing: 18) {
      Metric(label: "CTL", value: fitness.ctl, delta: fitness.ctlDelta7, goodUp: true)
      Metric(label: "ATL", value: fitness.atl, delta: fitness.atlDelta7, goodUp: false)
    }
    FormLine(fitness: fitness).padding(.top, 6)
  }
}

struct FitnessView: View {
  let entry: SnapshotEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    WidgetCardView {
      if let snap = entry.snapshot {
        if let f = snap.fitness {
          if family == .systemMedium {
            HStack(alignment: .top, spacing: 10) {
              VStack(alignment: .leading, spacing: 0) {
                WidgetCapsLabel(text: "Fitness", size: 9)
                FitnessBody(fitness: f).padding(.top, 5)
                Spacer(minLength: 0)
              }
              Spacer(minLength: 0)
              VStack(alignment: .trailing, spacing: 4) {
                Spacer(minLength: 0)
                CtlBars(series: f.series, height: 44)
                  .frame(width: 96)
                Text(snapshotAgeLabel(snap.writtenAt, at: entry.date))
                  .font(.system(size: 8.5))
                  .foregroundStyle(W.muted)
              }
            }
          } else {
            VStack(alignment: .leading, spacing: 0) {
              WidgetCapsLabel(text: "Fitness", size: 9)
              FitnessBody(fitness: f).padding(.top, 6)
              Spacer(minLength: 0)
              CtlBars(series: f.series, height: 26)
            }
          }
        } else {
          VStack(alignment: .leading, spacing: 0) {
            WidgetCapsLabel(text: "Fitness", size: 9)
            Text("Connect intervals.icu in the app.")
              .font(.system(size: 12))
              .foregroundStyle(W.muted)
              .lineLimit(2)
              .padding(.top, 6)
            Spacer(minLength: 0)
          }
        }
      } else {
        NoDataView()
      }
    }
  }
}

struct FitnessWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "fitness", provider: SnapshotProvider()) { entry in
      FitnessView(entry: entry)
    }
    .configurationDisplayName("Fitness")
    .description("CTL/ATL fitness trend, form band and a 14-day sparkline.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
