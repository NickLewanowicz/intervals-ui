#!/usr/bin/env bash
#
# tools/ios_widgets_setup.sh — add the WidgetKit extension to the GENERATED
# iOS project (round 17).
#
# ┌──────────────────────────────────────────────────────────────────────────┐
# │ WHY THIS EXISTS                                                          │
# │                                                                          │
# │ `apps/expo/ios/` is a generated artifact (expo prebuild, CNG — the dir   │
# │ is gitignored). A WidgetKit extension needs a native target in the       │
# │ .xcodeproj, which prebuild will never create and would wipe on the next  │
# │ run. This script is the ONLY place iOS project surgery lives; re-running │
# │ it after any `expo prebuild --platform ios` restores:                    │
# │                                                                          │
# │   1. the `intervalscoachWidgets` app-extension target (SwiftUI,          │
# │      WidgetKit; sources copied from apps/expo/widgets-ios/)              │
# │   2. App Group entitlements on BOTH targets                              │
# │      (group.com.anonymous.intervalscoach)                               │
# │   3. the embed + dependency wiring app → extension                       │
# └──────────────────────────────────────────────────────────────────────────┘
#
# ORDER OF OPERATIONS (after every prebuild):
#
#   cd apps/expo && npx expo prebuild --platform ios --no-install
#   cd ios && /opt/homebrew/opt/cocoapods/bin/pod install   # brew pod, see docs/TESTING.md
#   cd ../.. && tools/ios_widgets_setup.sh                  # THIS SCRIPT
#   cd apps/expo/ios && xcodebuild -workspace intervalscoach.xcworkspace \
#       -scheme intervalscoach -configuration Release -sdk iphonesimulator \
#       -derivedDataPath build/ios -quiet build
#
# The script is IDEMPOTENT: it detects an existing widget target, removes it
# (plus its embed/dependency wiring) and recreates it from the git-tracked
# sources in apps/expo/widgets-ios/, so re-running is always safe and the
# generated project always matches the checked-in Swift.
#
# Requires: a ruby that can `require "xcodeproj"` — plain ruby, or the vendored
# gems of the Homebrew cocoapods formula (GEM_HOME=$(brew --prefix cocoapods)/libexec).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$REPO_ROOT/apps/expo"
IOS_DIR="$APP_DIR/ios"
PROJECT_FILE="$IOS_DIR/intervalscoach.xcodeproj/project.pbxproj"

EXT_NAME="intervalscoachWidgets"
SRC_DIR="$APP_DIR/widgets-ios"
DST_DIR="$IOS_DIR/$EXT_NAME"
APP_GROUP="group.com.anonymous.intervalscoach"
EXT_BUNDLE_ID="com.anonymous.intervalscoach.widgets"
EXT_DEPLOYMENT_TARGET="17.0" # containerBackground(.widget) is iOS 17+

log() { printf '\033[1;34m[ios-widgets]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[ios-widgets] FATAL:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$PROJECT_FILE" ] || die "no generated iOS project at $PROJECT_FILE — run 'npx expo prebuild --platform ios --no-install' first (then pod install, then re-run this script)"
[ -d "$SRC_DIR" ] || die "widget sources missing at $SRC_DIR"

# --- locate a ruby with the xcodeproj gem -----------------------------------
find_ruby() {
  if ruby -e 'require "xcodeproj"' >/dev/null 2>&1; then
    RUBY_CMD=(ruby)
    return 0
  fi
  local prefix=""
  if command -v brew >/dev/null 2>&1; then
    prefix="$(brew --prefix cocoapods 2>/dev/null || true)"
  fi
  if [ -n "$prefix" ] && ls -d "$prefix/libexec/gems/xcodeproj-"* >/dev/null 2>&1; then
    RUBY_CMD=(env "GEM_HOME=$prefix/libexec" ruby)
    return 0
  fi
  return 1
}
find_ruby || die "no ruby found that can load the xcodeproj gem (try: brew install cocoapods)"
log "ruby: ${RUBY_CMD[*]} (xcodeproj gem ok)"

# --- 1. copy git-tracked widget sources into the generated project ----------
log "syncing $SRC_DIR → $DST_DIR"
rm -rf "$DST_DIR"
mkdir -p "$DST_DIR"
cp "$SRC_DIR"/*.swift "$SRC_DIR/Info.plist" "$DST_DIR/"

# --- 2. App Group entitlements (both targets) -------------------------------
write_entitlements() {
  local path="$1"
  cat > "$path" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>$APP_GROUP</string>
	</array>
</dict>
</plist>
PLIST
}
log "writing App Group ($APP_GROUP) entitlements for app + extension"
write_entitlements "$IOS_DIR/intervalscoach/intervalscoach.entitlements" # app target (prebuild writes an empty dict)
write_entitlements "$DST_DIR/$EXT_NAME.entitlements"

# --- 3. project surgery ------------------------------------------------------
log "patching $PROJECT_FILE (add/recreate target '$EXT_NAME')"
"${RUBY_CMD[@]}" - "$IOS_DIR/intervalscoach.xcodeproj" "$EXT_NAME" "$DST_DIR" "$EXT_BUNDLE_ID" "$EXT_DEPLOYMENT_TARGET" <<'RB'
require 'xcodeproj'

project_file, ext_name, dst_dir, ext_bundle_id, ext_deployment_target = ARGV
project = Xcodeproj::Project.open(project_file)

app_target = project.targets.find { |t| t.name == 'intervalscoach' }
raise 'app target `intervalscoach` not found' unless app_target

# --- idempotency: wipe any previous incarnation of the extension -----------
existing = project.targets.find { |t| t.name == ext_name }
if existing
  puts "[ios-widgets] existing target found — removing for a clean recreate"
  app_target.dependencies.dup.each do |dep|
    dep.remove_from_project if dep.target == existing
  end
  app_target.copy_files_build_phases.dup.each do |phase|
    phase.files.dup.each do |f|
      f.remove_from_project if f.file_ref == existing.product_reference
    end
    phase.remove_from_project if phase.files.empty? && phase.name == 'Embed Foundation Extensions'
  end
  existing.product_reference&.remove_from_project
  existing.remove_from_project
end
group = project.main_group.children.find { |g| g.respond_to?(:name) && g.name == ext_name }
group&.remove_from_project

# --- recreate ---------------------------------------------------------------
ext_target = project.new_target(:app_extension, ext_name, :ios, ext_deployment_target)
ext_target.product_reference.name = ext_name

group = project.main_group.new_group(ext_name, ext_name)
swift_refs = Dir.glob(File.join(dst_dir, '*.swift')).sort.map do |path|
  ref = group.new_reference(File.basename(path))
  ext_target.source_build_phase.add_file_reference(ref)
  ref
end
# Info.plist + .entitlements are referenced by build settings, not phases
group.new_reference('Info.plist')
group.new_reference("#{ext_name}.entitlements")

# shared values copied from the app target so versions never drift
app_release = app_target.build_configurations.find { |c| c.name == 'Release' }
marketing_version = app_release.resolve_build_setting('MARKETING_VERSION') || '1.0'
current_version   = app_release.resolve_build_setting('CURRENT_PROJECT_VERSION') || '1'
device_family     = app_release.resolve_build_setting('TARGETED_DEVICE_FAMILY') || '1,2'

common_settings = {
  'PRODUCT_BUNDLE_IDENTIFIER' => ext_bundle_id,
  'PRODUCT_NAME' => '$(TARGET_NAME)',
  'INFOPLIST_FILE' => "#{ext_name}/Info.plist",
  'CODE_SIGN_ENTITLEMENTS' => "#{ext_name}/#{ext_name}.entitlements",
  'CODE_SIGN_STYLE' => 'Automatic',
  'MARKETING_VERSION' => marketing_version,
  'CURRENT_PROJECT_VERSION' => current_version,
  'TARGETED_DEVICE_FAMILY' => device_family,
  'SWIFT_VERSION' => '5.0',
  'SWIFT_EMIT_LOC_STRINGS' => 'YES',
  'CLANG_ENABLE_MODULES' => 'YES',
  'DEFINES_MODULE' => 'NO',
  'GENERATE_INFOPLIST_FILE' => 'NO',
  'SKIP_INSTALL' => 'YES',
  'LD_RUNPATH_SEARCH_PATHS' => [
    '$(inherited)',
    '@executable_path/Frameworks',
    '@executable_path/../../Frameworks',
  ],
}
ext_target.build_configurations.each do |config|
  config.build_settings.merge!(common_settings)
end

# app depends on the extension and embeds its .appex into PlugIns/
app_target.add_dependency(ext_target)
embed = app_target.new_copy_files_build_phase('Embed Foundation Extensions')
embed.dst_subfolder_spec = '13' # PlugIns
embed_file = embed.add_file_reference(ext_target.product_reference, true)
embed_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "[ios-widgets] target '#{ext_name}' created: " \
     "#{swift_refs.size} swift sources, bundle id #{ext_bundle_id}, " \
     "deployment target iOS #{ext_deployment_target}, embedded into `intervalscoach`"
RB

log "done. Rebuild with the xcodebuild command in docs/TESTING.md (pod install NOT affected — run it before this script)."
