#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone 16 Pro}"

# Find a matching simulator (prefer newest iOS version)
SIM_ID=$(xcrun simctl list devices available -j | python3 -c "
import sys, json
data = json.load(sys.stdin)
matches = []
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['name'] == '$DEVICE_NAME' and d['isAvailable']:
            matches.append((runtime, d['udid']))
matches.sort(reverse=True)
if matches:
    print(matches[0][1])
" 2>/dev/null)

if [ -z "$SIM_ID" ]; then
  echo "Error: No simulator found for '$DEVICE_NAME'"
  echo "Available devices:"
  xcrun simctl list devices available | grep -E "^\s+\w" | head -20
  exit 1
fi

echo "Using simulator: $DEVICE_NAME ($SIM_ID)"

# Build mobile web assets and copy to iOS bundle
echo "Building mobile web assets..."
WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
pnpm --filter mobile build
mkdir -p "$SCRIPT_DIR/UtralTodo/www"
rm -rf "$SCRIPT_DIR/UtralTodo/www/"*
cp -r "$WORKSPACE/apps/mobile/dist/"* "$SCRIPT_DIR/UtralTodo/www/"

# Boot simulator if not already booted
BOOTED=$(xcrun simctl list devices booted -j | python3 -c "
import sys, json
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    for d in devices:
        if d['udid'] == '$SIM_ID':
            print('yes')
            sys.exit(0)
print('no')
" 2>/dev/null)

if [ "$BOOTED" = "no" ]; then
  echo "Booting simulator..."
  xcrun simctl boot "$SIM_ID"
  open -a Simulator
  sleep 3
fi

# Generate Xcode project
echo "Generating Xcode project..."
xcodegen generate --quiet

# Build
echo "Building app..."
BUILD_DIR="$SCRIPT_DIR/.build"
rm -rf "$BUILD_DIR"
xcodebuild -project UtralTodo.xcodeproj -scheme UtralTodo \
  -destination "id=$SIM_ID" -configuration Debug \
  -derivedDataPath "$BUILD_DIR" build -quiet

# Find the built app
APP_PATH=$(find "$BUILD_DIR" -name "UtralTodo.app" -path "*/Debug-iphonesimulator/*" 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
  echo "Error: Could not find built app"
  exit 1
fi

echo "App built at: $APP_PATH"

# Install
echo "Installing app..."
xcrun simctl install "$SIM_ID" "$APP_PATH"

# Launch
echo "Launching app..."
xcrun simctl launch "$SIM_ID" com.logat.utralTodo

echo ""
echo "App is running on $DEVICE_NAME simulator."
echo "For hot-reload, run: pnpm dev:mobile"
