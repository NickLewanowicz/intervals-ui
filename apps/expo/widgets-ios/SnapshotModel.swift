// The snapshot wire model — a 1:1 Codable mirror of WidgetSnapshot in
// apps/expo/src/lib/widget-data.ts (key names pinned by
// src/lib/__tests__/widget-ios.test.ts). The extension renders ONLY from
// what the app wrote into the App Group; it never touches the network.

import Foundation

struct WidgetSnapshot: Codable {
  let version: Int
  /// Epoch ms of the write — powers the "updated Xm ago" line.
  let writtenAt: Double
  /// The write-time today (ISO) — fallback for today-highlighting.
  let today: String
  let nextRace: NextRace?
  let upcoming: [UpcomingEntry]
  let fitness: Fitness?

  struct NextRace: Codable {
    let name: String
    let date: String
    let time: String
    /// Write-time value; widgets recompute against the render date so the
    /// countdown rolls over at midnight without an app write.
    let daysUntil: Int
  }

  struct UpcomingEntry: Codable {
    let date: String
    let dow: String
    let day: Int
    let isToday: Bool
    let isRace: Bool
    let done: Bool
    /// Round-19 additive fields (Android done/missed states). Optional with a
    /// default so snapshots written before the field existed still decode and
    /// the sample fixtures stay unchanged.
    var missed: Bool? = nil
    var unplanned: Bool? = nil
    let name: String
    let metric: String
  }

  struct Fitness: Codable {
    let ctl: Double
    let atl: Double
    let form: Double
    let bandWord: String
    let ctlDelta7: Double?
    let atlDelta7: Double?
    /// Last 14 calendar days of CTL, oldest first; null where no row.
    let series: [SeriesPoint]

    struct SeriesPoint: Codable {
      let date: String
      let ctl: Double?
    }
  }
}

enum SnapshotStore {
  /// MUST match WidgetSnapshotBridgeModule.appGroupId + the App Group in the
  /// entitlements written by tools/ios_widgets_setup.sh.
  static let appGroupId = "group.com.anonymous.intervalscoach"
  /// MUST match WIDGET_SNAPSHOT_KEY in widget-data.ts.
  static let snapshotKey = "widget.snapshot.v1"

  /// Never throws — a corrupt/absent snapshot is just "no data yet".
  static func load() -> WidgetSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let raw = defaults.string(forKey: snapshotKey),
          let data = raw.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}

// ---------------------------------------------------------------------------
// Render-side helpers (mirrors of the TS pure functions)
// ---------------------------------------------------------------------------

/// "21 DAYS" / "TOMORROW" / "TODAY" — the big countdown line.
func raceCountdownLabel(_ daysUntil: Int) -> String {
  if daysUntil <= 0 { return "TODAY" }
  if daysUntil == 1 { return "TOMORROW" }
  return "\(daysUntil) DAYS"
}

private let weekdayShorts = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
private let monthShorts = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

private func utcCalendar() -> Calendar {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = TimeZone(identifier: "UTC")!
  return cal
}

/// Whole days from `fromISO` to `toISO` (both YYYY-MM-DD; mirrors TS daysUntil).
func daysUntilISO(_ fromISO: String, _ toISO: String) -> Int? {
  let cal = utcCalendar()
  guard let from = isoDate(fromISO), let to = isoDate(toISO) else { return nil }
  return cal.dateComponents([.day], from: from, to: to).day
}

func isoDate(_ iso: String) -> Date? {
  let parts = iso.split(separator: "-").compactMap { Int($0) }
  guard parts.count == 3 else { return nil }
  return utcCalendar().date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

/// "SUN NOV 8 · 09:00" — the small-caps date line (time omitted when absent).
func raceDateLine(_ date: String, _ time: String) -> String {
  let cal = utcCalendar()
  guard let d = isoDate(date) else { return date }
  let comps = cal.dateComponents([.weekday, .day, .month], from: d)
  let weekday = weekdayShorts[(comps.weekday! + 5) % 7]
  let month = monthShorts[comps.month! - 1]
  var parts = ["\(weekday) \(month) \(comps.day!)".uppercased()]
  if !time.isEmpty { parts.append(time) }
  return parts.joined(separator: " · ")
}

/// Live countdown at render time (so the midnight timeline entry rolls
/// DAYS → TODAY without waiting for the next app write).
func liveDaysUntil(_ race: WidgetSnapshot.NextRace, at date: Date) -> Int {
  let today = Calendar.current.startOfDay(for: date)
  let todayISO = isoToday(today)
  return daysUntilISO(todayISO, race.date) ?? race.daysUntil
}

/// "YYYY-MM-DD" of the given instant in the device's calendar.
func isoToday(_ date: Date) -> String {
  let comps = Calendar.current.dateComponents([.year, .month, .day], from: date)
  return String(format: "%04ld-%02ld-%02ld", comps.year!, comps.month!, comps.day!)
}

/// "updated 5m ago" — mirror of the TS relativeTime minute-granularity rule.
func snapshotAgeLabel(_ writtenAtMs: Double, at date: Date) -> String {
  let diffMin = Int(max(0, date.timeIntervalSince1970 * 1000 - writtenAtMs) / 60_000)
  if diffMin < 1 { return "updated just now" }
  if diffMin < 60 { return "updated \(diffMin)m ago" }
  let h = diffMin / 60
  if h < 24 { return "updated \(h)h ago" }
  return "updated \(h / 24)d ago"
}

/// "+2.1" chip label; nil hides the chip.
func deltaLabel(_ d: Double?) -> String? {
  guard let d else { return nil }
  let r = (d * 10).rounded() / 10
  return String(format: "%+.1f", r)
}

/// Gallery/placeholder sample so the widget picker shows a real card.
let sampleSnapshot = WidgetSnapshot(
  version: 1,
  writtenAt: Date().timeIntervalSince1970 * 1000,
  today: isoToday(Date()),
  nextRace: .init(name: "Riverside 10K", date: "2026-11-08", time: "09:00", daysUntil: 15),
  upcoming: [
    .init(date: isoToday(Date()), dow: "Sat", day: 24, isToday: true, isRace: false, done: true,
          name: "Morning run", metric: "8.3km · 45m · load 61"),
    .init(date: "2026-10-26", dow: "Mon", day: 26, isToday: false, isRace: false, done: false,
          name: "Easy 6", metric: "9.7km · 46m · load 52"),
    .init(date: "2026-10-28", dow: "Wed", day: 28, isToday: false, isRace: false, done: false,
          name: "Tempo 6", metric: "6.2km · 30m · load 48"),
    .init(date: "2026-11-01", dow: "Sun", day: 1, isToday: false, isRace: true, done: false,
          name: "Club half", metric: "21.1km · 1:38 · load 120"),
  ],
  fitness: .init(
    ctl: 47.3, atl: 55.2, form: -7.9, bandWord: "slightly fatigued",
    ctlDelta7: 2.1, atlDelta7: -4.3,
    series: (0..<14).map { i in
      .init(date: "2026-10-\(11 + i)", ctl: i == 4 ? nil : 40 + Double(i) * 0.6)
    }
  )
)
