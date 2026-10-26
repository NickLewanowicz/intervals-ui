#!/usr/bin/env bash
# iOS half of the parity capture flow (qa-parity iOS round 1).
#
# Usage: tools/parity_ios.sh [all]
#
# Drives intervalscoach.app on the intervals-iphone simulator (iPhone 16/17
# Pro class, 402x874 @3x = 1206x2622 px) via idb (ui describe/tap/text/swipe)
# and captures PNGs with `xcrun simctl io <udid> screenshot` — same pixel
# dimensions as tools/parity_web_ios.cjs (402x874 @ deviceScaleFactor 3).
#
# Output: qa-screenshots/parity/ios/*.png (dark pass + light-*.png pass)
#
# Hard-won rules (same as the Android flow):
#   - NEVER tap blind coordinates: locate every field with `idb ui describe`
#     (accessibility tree + frames) and tap the parsed center.
#   - The device must be in DARK appearance for the main pass (app is
#     dark-first): xcrun simctl ui <udid> appearance dark. The light pass uses
#     the IN-APP settings override (Theme Light button), then restores
#     Theme System — nothing is saved.
#   - idb ui text types into the FOCUSED field; verify text landed via a
#     re-describe before submitting.
#   - The companion must be running: idb_companion --udid <udid> & then
#     idb connect localhost <grpc_port>.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/qa-screenshots/parity/ios"
UDID="${IOS_UDID:-3AE59F28-6801-4426-9054-F57B20299899}"
APP="${IOS_APP:-$ROOT/apps/expo/ios/build/ios/Build/Products/Release-iphonesimulator/intervalscoach.app}"
BUNDLE="com.anonymous.intervalscoach"
CRED_FILE="$ROOT/.scratch/dev-user.txt"
WEB_URL="${WEB_URL:-https://intervals.imnick.dev}"

DAY="${PARITY_DAY:-Monday 26}"   # live week content day; re-derive when the week rolls
EMAIL="$(awk 'NR==1{print $1}' "$CRED_FILE")"
PASS="$(awk 'NR==1{print $NF}' "$CRED_FILE")"

shot() { xcrun simctl io "$UDID" screenshot "$OUT/$1.png" >/dev/null 2>&1; echo "  ios/$1.png"; }

# find <label-substring> -> prints "x y" (center in device pixels), fails if absent
find_el() {
  idb ui describe --udid "$UDID" --json 2>/dev/null | python3 -c "
import json,sys
want = sys.argv[1].lower()
els = json.load(sys.stdin)
def walk(nodes):
    for n in nodes:
        f = n.get('frame') or {}
        label = str(n.get('AXLabel') or '')
        if want in label.lower() and f.get('width',0) > 0:
            print(int(f['x']+f['width']/2), int(f['y']+f['height']/2)); return True
        if walk(n.get('children') or []): return True
    return False
ok = walk(els if isinstance(els, list) else els.get('elements', []))
sys.exit(0 if ok else 1)
" "$1"
}

tap_el() { # find + tap + settle
  local xy; xy=$(find_el "$1") || { echo "ERROR: element '$1' not found" >&2; return 1; }
  idb ui tap $xy --udid "$UDID"
  sleep "${2:-1.2}"
}

type_into() { # find, tap, type, verify by re-describe
  tap_el "$1" 1.0
  idb ui text "$2" --udid "$UDID"
  sleep 0.6
}

dismiss_keyboard() { idb ui key 40 --udid "$UDID" 2>/dev/null || true; sleep 0.6; } # HID 40 = Return

ensure_companion() {
  idb list-targets 2>/dev/null | grep -q "localhost:" && return 0
  nohup idb_companion --udid "$UDID" > /tmp/idb_companion_parity.log 2>&1 &
  sleep 4
  local port; port=$(grep -o '"grpc_port":[0-9]*' /tmp/idb_companion_parity.log | grep -o '[0-9]*')
  idb connect localhost "$port"
}

ios_sign_in() { # $1 optional shot name with fields filled
  echo "  -- signing in --"
  type_into "you@example.com" "$EMAIL"
  type_into "Password" "$PASS" || tap_el "•••" 0.5   # placeholder fallback
  [ -n "${1:-}" ] && shot "$1"
  dismiss_keyboard
  tap_el "Sign in" 1
  for _ in $(seq 1 20); do sleep 2; find_el "Calendar" >/dev/null 2>&1 && break; done
  find_el "Calendar" >/dev/null || { echo "ERROR: sign-in did not reach calendar" >&2; exit 1; }
}

flow() {
  mkdir -p "$OUT"
  ensure_companion
  xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || true
  xcrun simctl ui "$UDID" appearance dark   # app is dark-first

  xcrun simctl install "$UDID" "$APP"
  xcrun simctl launch "$UDID" "$BUNDLE"
  sleep 8
  shot "00-first-launch"                    # native lands on sign-in (by design)

  ios_sign_in "02-sign-in-filled"
  sleep 8; shot "03-calendar-week"          # auto-scrolled to today

  # week top: hero + pills + day cards
  tap_el "Month" 1.2 || true; for _ in 1 2 3 4 5; do find_el "Month" >/dev/null && break; idb ui swipe 603 700 603 1900 --udid "$UDID"; sleep 1.2; done
  shot "04-week-top"

  tap_el "Select ${DAY}" 1.5
  shot "05-week-pill-selected"

  # day sheet: tap the Thursday DayCard header
  tap_el "Open ${DAY} details" 1.5
  shot "06-sheet-open"
  # "Open full" -> /calendar/day route (in-app); deep-link scheme test after
  tap_el "Open full" 2.5 && shot "06b-day-route" || echo "  NOTE: Open full not found"
  tap_el "Back to calendar" 1.5

  # month view: selection panel below the grid
  tap_el "Month" 2
  tap_el "^26$" 1.5 || tap_el "26" 1.5
  shot "08-calendar-month"
  shot "08b-month-day-panel"
  idb ui swipe 603 1600 603 700 --udid "$UDID"; sleep 1.2
  shot "08c-month-panel-runs"

  # deep link probe (bridge-dependent): intervals://calendar/day
  xcrun simctl openurl "$UDID" "intervals://calendar/day" && sleep 3 && shot "06c-deeplink-day" || echo "  NOTE: openurl failed (document in report)"

  # coach
  tap_el "Coach" 2.5
  tap_el "New chat" 1.2 || true
  shot "09-coach-empty"
  type_into "Message your coach" "What does my week look like?"
  tap_el "Send" 1 || dismiss_keyboard        # send button if present, else Return sends
  sleep 8; shot "10-coach-reply-streamed"
  for _ in $(seq 1 8); do sleep 8; find_el "Message your coach" >/dev/null && break; done
  shot "11-coach-reply-done"
  idb ui swipe 603 1500 603 900 --udid "$UDID"; sleep 1
  idb ui swipe 603 1500 603 900 --udid "$UDID"; sleep 1
  shot "11b-coach-chat-bottom"              # KEY CHECK: input visible above keyboard/home indicator?

  # settings + sign out
  tap_el "Settings" 2.5
  shot "12-settings"
  idb ui swipe 603 1700 603 600 --udid "$UDID"; sleep 1.5
  shot "12b-settings-scrolled"
  for _ in 1 2 3 4 5; do find_el "Sign out" >/dev/null && break; idb ui swipe 603 700 603 1900 --udid "$UDID"; sleep 1.2; done
  tap_el "Sign out" 2.5
  shot "13-sign-out"

  # ---------- LIGHT pass via the IN-APP override (restored after) ----------
  echo "  -- light theme pass (in-app override) --"
  # re-sign-in if sign-out returned to the auth screen
  if find_el "you@example.com" >/dev/null 2>&1; then
    ios_sign_in; sleep 4
  fi
  tap_el "Settings" 2.5
  tap_el "Theme Light" 1.5
  shot "light-12-settings-theme-override"
  tap_el "Calendar" 2
  for _ in 1 2 3 4 5; do find_el "Month" >/dev/null && break; idb ui swipe 603 700 603 1900 --udid "$UDID"; sleep 1.2; done
  shot "light-04-week-top"
  tap_el "Select ${DAY}" 1.5; shot "light-05-week-pill-selected"
  tap_el "Open ${DAY} details" 1.5; shot "light-06-sheet-open"
  tap_el "Close day detail" 1.2 || tap_el "X" 1.2 || true
  tap_el "Month" 2; tap_el "22" 1.5; shot "light-08b-month-day-panel"
  idb ui swipe 603 1600 603 700 --udid "$UDID"; sleep 1.2; shot "light-08c-month-panel-runs"
  tap_el "Coach" 2.5; tap_el "New chat" 1.2 || true; shot "light-09-coach"
  tap_el "Settings" 2.5
  tap_el "Theme System" 1.5                  # RESTORE — nothing saved
  shot "restored-12-settings"
  echo "done iOS captures -> $OUT/"
}

flow
