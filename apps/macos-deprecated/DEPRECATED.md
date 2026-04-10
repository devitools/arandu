# ⚠️ DEPRECATED

This macOS native app (Swift + AppKit + WebKit) has been **discontinued** as of February 2025.

## Why?

The project now focuses exclusively on the **Tauri cross-platform app** (`apps/tauri/`), which provides:

- Cross-platform support (macOS, Linux, Windows)
- Unified codebase and maintenance
- Better plugin ecosystem
- All features from the native app + new capabilities (ACP integration, plan workflow, voice-to-text, and more)

## Migration

If you're using the macOS native app, please switch to the Tauri version:

```bash
cd apps/tauri
npm install
npx tauri build
```

Or install via Homebrew:

```bash
brew install --cask devitools/arandu/arandu
```

## Archive

This code is kept for historical reference and learning purposes. It will not receive updates or bug fixes.

**Last maintained**: v0.2.0 (February 2025)
