# Quick Start

This guide takes you from zero to an open Markdown file in under 2 minutes.

## 1. Install Arandu

```bash
# macOS via Homebrew
brew install --cask devitools/arandu/arandu

# Or download from github.com/devitools/arandu/releases/latest
```

## 2. Open a file

### Via CLI

```bash
arandu README.md
```

### Via the GUI

Open Arandu and click **Open File** on the home screen, or drag a `.md` file onto the window.

### Via file picker

Run `arandu` without arguments to open the file picker.

## 3. Explore the interface

```
┌──────────────────────────────────────┐
│  [≡] Arandu — README.md      [☀/☾]  │
├────────────┬─────────────────────────┤
│  OUTLINE   │                         │
│            │  # Title                │
│  > Title   │                         │
│    Section │  Text paragraph...      │
│    Section │                         │
│            │  ## Section 1           │
│            │  ...                    │
└────────────┴─────────────────────────┘
```

- **Sidebar outline**: click any heading to navigate
- **Theme button**: toggles between system/light/dark
- **Live reload**: save the file in another editor — Arandu updates automatically

## 4. Next steps

- [Viewing Markdown](/en/guide/viewing-markdown) — learn what's supported
- [AI Workspace](/en/features/workspace) — connect a coding agent
- [Whisper](/en/features/whisper) — set up voice to text
