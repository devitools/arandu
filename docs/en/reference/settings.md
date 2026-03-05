# Settings

Access settings via **Arandu → Preferences…** or `Cmd/Ctrl+,`.

## Appearance

### Theme
- **System**: follows the operating system theme
- **Light**: always light
- **Dark**: always dark

## Voice to Text

### Whisper Model
Download and select the transcription model:
- `tiny` (~75 MB)
- `base` (~140 MB) — recommended
- `small` (~460 MB)
- `medium` (~1.5 GB)

### Audio Device
Select the microphone to use for recording.

### Recording Shortcut
Global shortcut to open the recording window. Default: **Alt+Space**.

### Language
Transcription language. Default: automatic detection.

## Interface language

- **Português (Brasil)**: Portuguese interface
- **English**: English interface

The language is synchronized across all open windows and the system tray menu.

## Data storage

| Data | Location |
|------|----------|
| Settings | `~/.config/com.devitools.arandu/` |
| Comments and sessions | `~/.local/share/com.devitools.arandu/comments.db` |
| Plans | `~/.local/share/com.devitools.arandu/plans/` |
| Whisper models | `~/.local/share/com.devitools.arandu/whisper-models/` |
| File history | `~/.local/share/com.devitools.arandu/history.json` |

*Paths are for Linux. On macOS, use `~/Library/Application Support/com.devitools.arandu/`.*

## Resetting settings

To reset all settings to defaults, remove the configuration directory and restart Arandu.
