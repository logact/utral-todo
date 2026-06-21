#!/bin/bash
set -e

APPLE_ID="${APPLE_ID:-logact@qq.com}"
TEAM_ID="${TEAM_ID:-VW8PZV3Z69}"
APP_SPECIFIC_PASSWORD="${APPLE_APP_PASSWORD:-}"

BUNDLE_DIR="src-tauri/target/release/bundle/dmg"
DMG_FILE=$(ls "$BUNDLE_DIR"/*.dmg 2>/dev/null | head -1)

if [ -z "$DMG_FILE" ]; then
  echo "No DMG found — skipping notarization (build with --bundles dmg to create one)"
  exit 0
fi

if [ -z "$APP_SPECIFIC_PASSWORD" ]; then
  echo "APPLE_APP_PASSWORD not set — skipping notarization"
  exit 0
fi

DMG_NAME=$(basename "$DMG_FILE")
echo "Notarizing $DMG_NAME..."

xcrun notarytool submit "$DMG_FILE" \
  --apple-id "$APPLE_ID" \
  --team-id "$TEAM_ID" \
  --password "$APP_SPECIFIC_PASSWORD" \
  --wait

echo "Stapling..."
xcrun stapler staple "$DMG_FILE"

echo "Done. Notarized: $DMG_NAME"
