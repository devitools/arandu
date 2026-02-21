#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: $0 <version>  (e.g. 0.3.0)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Setting version to $VERSION across all configs..."

# 1. macOS Info.plist
PLIST="$ROOT/apps/macos/Sources/Arandu/Info.plist"
if [ -f "$PLIST" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$PLIST"
  echo "  Info.plist -> $VERSION"
fi

# 2. Cargo.toml
CARGO="$ROOT/apps/tauri/src-tauri/Cargo.toml"
if [ -f "$CARGO" ]; then
  sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" "$CARGO"
  echo "  Cargo.toml -> $VERSION"
fi

# 3. tauri.conf.json
TAURI="$ROOT/apps/tauri/src-tauri/tauri.conf.json"
if [ -f "$TAURI" ]; then
  sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$TAURI"
  echo "  tauri.conf.json -> $VERSION"
fi

# 4. package.json
PKG="$ROOT/apps/tauri/package.json"
if [ -f "$PKG" ]; then
  cd "$ROOT/apps/tauri"
  npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null 2>&1
  echo "  package.json -> $VERSION"
fi

echo "Done."
