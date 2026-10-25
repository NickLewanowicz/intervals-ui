#!/usr/bin/env bash
# Capture screenshots of the intervals APK on the Android emulator and the
# equivalent web app, for the qa-parity persona to compare.
#
# Usage:
#   tools/parity_shots.sh emu       # drive the emulator via adb, capture PNGs
#   tools/parity_shots.sh web       # drive the deployed site via playwright, capture PNGs
#   tools/parity_shots.sh all       # both
#
# Output: qa-screenshots/parity/emu/*.png and qa-screenshots/parity/web/*.png
# Round-2 flow: week view v2 (day pills, day/run cards, DetailSheet on
# mobile/native, month selection panel with run cards) + coach/settings/
# sign-out regression shots + a light-theme week-view pass. The web side
# (tools/parity_web.cjs) adds desktop 1280px passes for the DetailSidePanel.
# Emulator must be running (Pixel5 @ 1080x2280, night mode YES — the app is
# dark-first; the web pass emulates dark to match). Creds: .scratch/dev-user.txt
#
# Emulator method (hard-won): NEVER tap blind coordinates. Locate every field
# with `uiautomator dump` (tools/uidump.py) and tap the parsed node center;
# screenshot between steps to verify. Dismiss the keyboard (keyevent 111)
# before tapping submit buttons. adb input text: %s = space, "?" is safe
# when quoted — do NOT use %3F (it goes in literally).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/qa-screenshots/parity"
MODE="${1:-all}"
EMU_SERIAL="${EMU_SERIAL:-emulator-5554}"
WEB_URL="${WEB_URL:-https://intervals.imnick.dev}"
CRED_FILE="$ROOT/.scratch/dev-user.txt"
PKG="com.anonymous.intervalscoach" # verify: adb shell pm list packages | grep intervals
UIDUMP="$ROOT/tools/uidump.py"
export ANDROID_SERIAL="$EMU_SERIAL"

shot_emu() {
  mkdir -p "$OUT/emu"
  adb -s "$EMU_SERIAL" exec-out screencap -p > "$OUT/emu/$1.png"
  echo "  emu/$1.png"
}

emu_type() { # type text with adb (spaces via %s), then verify it landed
  adb -s "$EMU_SERIAL" shell input text "$1"
  sleep 0.5
}

emu_scroll_top_to() { # drag down until $1 is tappable (max 5 drags); for reaching the top
  for _ in 1 2 3 4 5; do
    if python3 "$UIDUMP" find "$1" --clickable >/dev/null 2>&1; then return 0; fi
    adb -s "$EMU_SERIAL" shell input swipe 540 700 540 1900 400
    sleep 1.2
  done
  echo "WARN: $1 never became visible after scrolling to top" >&2
  return 1
}

# --- DetailSheet helpers -----------------------------------------------------
# RN's Android Modal renders in a separate window: uiautomator dump CANNOT see
# the sheet's contents (verified round 2). Sheet-head interactions therefore use
# Pixel5-geometry coordinates calibrated from the captured sheet (grabber at
# 540,829; "Open full" at 793,908; X at 975,908) and every step is verified by
# a screencap pixel check of the grabber color, not taken on faith.
SHEET_GRABBER_Y=829
sheet_open() { # exit 0 when the sheet is open (grabber pixel at rest; theme-agnostic —
               # open = the pixel is neither the dark card #151926 nor the light card #fff)
  adb exec-out screencap -p > /tmp/_sheet_state.png
  python3 -c "
from PIL import Image
px = Image.open('/tmp/_sheet_state.png').convert('RGB').load()
c = px[540, $SHEET_GRABBER_Y]
dark = sum((a-b)**2 for a,b in zip(c,(21,25,38))) ** 0.5
light = sum((a-b)**2 for a,b in zip(c,(255,255,255))) ** 0.5
exit(0 if dark > 30 and light > 30 else 1)
"
}
emu_open_day_sheet() { # tap the Thursday 22 DayCard header, scrolling to it if needed
  for _ in 1 2 3; do
    if python3 "$UIDUMP" tap-desc "Open Thursday 22 details" >/dev/null 2>&1; then
      sleep 1.8; sheet_open && return 0
    fi
    adb -s "$EMU_SERIAL" shell input swipe 540 600 540 1000 300; sleep 1.2
  done
  echo "ERROR: could not open the Thursday 22 sheet" >&2; return 1
}

emu_sign_in() { # fills + submits the sign-in form; verifies each field
  # optional $1 = shot name captured with fields filled, pre-submit (e.g. 02-sign-in-filled)
  echo "  -- signing in --"
  python3 "$UIDUMP" tap-text "you@example.com"            # email field (placeholder)
  sleep 0.8
  emu_type "$EMU_EMAIL"
  python3 "$UIDUMP" find "$EMU_EMAIL" --exact >/dev/null   # verify email landed exactly
  python3 "$UIDUMP" tap-edit 1                            # 2nd EditText = password
  sleep 0.8
  emu_type "$EMU_PASS"
  python3 "$UIDUMP" list | grep -q "EditText.*$EMU_EMAIL" # email still intact
  if [ -n "${1:-}" ]; then shot_emu "$1"; fi              # 02-sign-in-filled (keyboard up = platform diff)
  adb -s "$EMU_SERIAL" shell input keyevent 111           # dismiss keyboard
  sleep 1
  python3 "$UIDUMP" tap-text "Sign in" --clickable        # the Button (headings are not clickable)
  for _ in $(seq 1 15); do                                # login + PocketBase sync (cold starts)
    sleep 2
    if python3 "$UIDUMP" find "Calendar" --clickable >/dev/null 2>&1; then break; fi
  done
  python3 "$UIDUMP" find "Calendar" --clickable >/dev/null 2>&1 || {
    echo "ERROR: sign-in did not reach the calendar tab" >&2; exit 1; }
}

emu_flow() {
  echo "== emulator flow =="
  adb -s "$EMU_SERIAL" wait-for-device
  local EMAIL PASS
  EMAIL="$(awk 'NR==1{print $1}' "$CRED_FILE")"   # line 1 only — the file has prose lines
  PASS="$(awk 'NR==1{print $NF}' "$CRED_FILE")"
  local EMU_EMAIL="$EMAIL" EMU_PASS="$PASS"

  # fresh state
  adb -s "$EMU_SERIAL" shell pm clear "$PKG" >/dev/null
  adb -s "$EMU_SERIAL" shell cmd uimode night yes
  adb -s "$EMU_SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 8
  shot_emu "01-splash"                # native lands on sign-in (skips marketing — by design)

  emu_sign_in "02-sign-in-filled"
  shot_emu "03-calendar-week"         # auto-scrolled to today's day card

  # ---- week view v2: pills + titled day cards ----
  emu_scroll_top_to "Month"           # hero toggle visible = we are at the top
  shot_emu "04-week-top"              # hero + DayStrip pills + day cards

  python3 "$UIDUMP" tap-desc "Select Thursday 22"     # pill: select + scroll to day
  sleep 1.5
  shot_emu "05-week-pill-selected"

  emu_open_day_sheet                                  # DayCard header -> bottom sheet
  shot_emu "06-sheet-open"                            # sheet fully open (fits without scroll)

  # "Open full" -> /calendar/day (coordinate tap: Modal is invisible to the dump)
  adb -s "$EMU_SERIAL" shell input tap 793 908
  sleep 2.5
  python3 "$UIDUMP" find "Back to calendar" >/dev/null 2>&1 || {
    echo "ERROR: Open full did not reach the day route" >&2; exit 1; }
  shot_emu "06b-day-route"                            # /calendar/day deep link
  python3 "$UIDUMP" tap-desc "Back to calendar" || python3 "$UIDUMP" tap-text "Back to calendar"
  sleep 1.5

  # grabber drag-to-close (spec §3): drag the handle down; the sheet is
  # EXPECTED to close — if it stays open the shot documents that failure.
  emu_open_day_sheet
  adb -s "$EMU_SERIAL" shell input swipe 540 "$SHEET_GRABBER_Y" 540 1350 200
  sleep 1.2
  if sheet_open; then
    echo "  NOTE: grabber drag did NOT close the sheet (drag-to-close broken)"
  else
    echo "  grabber drag closed the sheet"
  fi
  shot_emu "07-sheet-drag-result"

  emu_open_day_sheet                                  # X (close icon) path
  adb -s "$EMU_SERIAL" shell input tap 975 908
  sleep 1.2
  if sheet_open; then echo "ERROR: X did not close the sheet" >&2; exit 1; fi
  shot_emu "07b-sheet-x-closed"

  # ---- month view: selection panel now renders run cards ----
  emu_scroll_top_to "Month"
  python3 "$UIDUMP" tap-text "Month" --clickable
  sleep 2
  python3 "$UIDUMP" tap-text "22" --exact             # day cell with planned+recorded
  sleep 1.5
  shot_emu "08-calendar-month"
  shot_emu "08b-month-day-panel"                      # grid with selection
  adb -s "$EMU_SERIAL" shell input swipe 540 1600 540 700 400; sleep 1.2
  shot_emu "08c-month-panel-runs"                     # panel below grid: run cards

  # ---- coach (round-1 BUG-1/BUG-2 regression check) ----
  python3 "$UIDUMP" tap-text "Coach" --clickable
  sleep 2.5
  python3 "$UIDUMP" tap-desc "New chat" 2>/dev/null || true   # server history persists
  sleep 1.2
  shot_emu "09-coach-empty"
  python3 "$UIDUMP" tap-text "Message your coach"     # chat input (placeholder)
  sleep 1
  emu_type "What%sdoes%smy%sweek%slook%slike?"
  python3 "$UIDUMP" find "What does my week look like?" >/dev/null
  adb -s "$EMU_SERIAL" shell input keyevent 66        # ENTER sends
  sleep 8
  shot_emu "10-coach-reply-streamed"
  for _ in $(seq 1 8); do                             # wait for stream to finish
    sleep 8
    if python3 "$UIDUMP" list | grep -q "Message your coach"; then break; fi
  done
  shot_emu "11-coach-reply-done"                      # BUG-2: tail visible without scroll?
  adb -s "$EMU_SERIAL" shell input swipe 540 1500 540 900 400; sleep 1
  adb -s "$EMU_SERIAL" shell input swipe 540 1500 540 900 400; sleep 1
  shot_emu "11b-coach-chat-bottom"

  # ---- settings + sign out ----
  python3 "$UIDUMP" tap-text "Settings" --clickable
  sleep 2.5
  shot_emu "12-settings"
  adb -s "$EMU_SERIAL" shell input swipe 540 1700 540 600 400; sleep 1.5
  shot_emu "12b-settings-scrolled"
  emu_scroll_top_to "Sign out"
  python3 "$UIDUMP" tap-text "Sign out" --clickable
  sleep 2.5
  shot_emu "13-sign-out"

  # ---------- LIGHT theme pass (system uimode, nothing saved in-app) ----------
  echo "  -- light theme pass --"
  adb -s "$EMU_SERIAL" shell cmd uimode night no
  adb -s "$EMU_SERIAL" shell am force-stop "$PKG"; sleep 1
  adb -s "$EMU_SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 8
  emu_sign_in
  sleep 4
  emu_scroll_top_to "Month"
  shot_emu "light-04-week-top"
  python3 "$UIDUMP" tap-desc "Select Thursday 22"; sleep 1.5
  shot_emu "light-05-week-pill-selected"
  emu_open_day_sheet
  shot_emu "light-06-sheet-open"
  adb -s "$EMU_SERIAL" shell input tap 975 908; sleep 1.2   # X (Modal not dumpable)
  emu_scroll_top_to "Month"
  python3 "$UIDUMP" tap-text "Month" --clickable; sleep 2
  python3 "$UIDUMP" tap-text "22" --exact; sleep 1.5
  shot_emu "light-08b-month-day-panel"
  adb -s "$EMU_SERIAL" shell input swipe 540 1600 540 700 400; sleep 1.2
  shot_emu "light-08c-month-panel-runs"
  python3 "$UIDUMP" tap-text "Coach" --clickable; sleep 2.5
  python3 "$UIDUMP" tap-desc "New chat" 2>/dev/null || true; sleep 1.2
  shot_emu "light-09-coach"
  python3 "$UIDUMP" tap-text "Settings" --clickable; sleep 2.5
  shot_emu "light-12-settings"
  adb -s "$EMU_SERIAL" shell cmd uimode night yes     # restore

  echo "done emulator captures -> $OUT/emu/"
}

web_flow() {
  echo "== web flow (playwright, 393x851, dark pass + light pass) =="
  NODE_PATH="${NODE_PATH:-/opt/homebrew/lib/node_modules}" \
    node "$ROOT/tools/parity_web.cjs" "$OUT" "$WEB_URL" "$CRED_FILE"
  echo "done web captures -> $OUT/web/"
}

case "$MODE" in
  emu) emu_flow ;;
  web) web_flow ;;
  all) emu_flow; web_flow ;;
  *) echo "usage: $0 [emu|web|all]"; exit 1 ;;
esac
