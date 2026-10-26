// Widget-only design tokens — Swift mirror of src/widgets/widget-theme.ts
// (which mirrors the app's dark palette). Same rule as TS: ZERO color
// literals outside this file. RACE is reserved for race rows; success/danger
// mark direction only.

import SwiftUI

enum W {
  static let card = hex(0x151926)
  static let bg = hex(0x0B0E15)
  static let borderGlass = Color.white.opacity(0.10)
  static let borderStrong = Color.white.opacity(0.18)
  static let text = hex(0xF3F5FA)
  static let muted = hex(0x98A1B8)
  static let mutedStrong = hex(0xCCD4E6)
  static let onAccent = Color.white
  /// Deepened indigo — white-on-accent passes WCAG AA (5.05:1).
  static let accent = hex(0x4A63E0)
  static let accentSoft = Color(hex: 0x5B74F0).opacity(0.16)
  /// Accent as text on the card — brightened for contrast on dark.
  static let accentText = hex(0x96A9FF)
  static let success = hex(0x41B26E)
  static let danger = hex(0xE5584F)
  /// RACE ONLY.
  static let race = hex(0xE0A458)

  static func hex(_ value: UInt) -> Color {
    Color(
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255
    )
  }
}

extension Color {
  init(hex value: UInt) { self = W.hex(value) }
}

/// Small-caps-feel label: uppercase + tracking (the Android widgets use the
/// same trick — real small caps don't exist there either).
struct WidgetCapsLabel: View {
  let text: String
  var color: Color = W.muted
  var size: CGFloat = 9

  var body: some View {
    Text(text.uppercased())
      .font(.system(size: size, weight: .semibold))
      .tracking(1.1)
      .foregroundStyle(color)
  }
}
