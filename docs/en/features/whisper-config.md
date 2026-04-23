# Whisper Configuration

Go to **Settings → Voice to Text** to configure Whisper.

## Models

### Download

Models are not pre-installed. The first time, go to **Settings → Voice to Text → Download model** and choose the size:

| Model | Size | RAM usage | Best for |
|-------|------|-----------|----------|
| tiny | ~75 MB | ~200 MB | Quick use, limited hardware |
| base | ~140 MB | ~300 MB | General use (recommended) |
| small | ~460 MB | ~600 MB | Technical content |
| medium | ~1.5 GB | ~2 GB | Maximum precision |

### Switching models

You can download multiple models and switch between them at any time. The active model is highlighted in settings.

## Audio device

By default, Arandu uses the system's default microphone. To use another device:

1. Go to **Settings → Voice to Text → Audio device**
2. Select the desired device from the list
3. Test it by clicking **Test**

## Recording shortcut

The default shortcut is **Alt+Space**. To customize:

1. Go to **Settings → Voice to Text → Recording Shortcut**
2. Click the field and press the desired combination
3. Save

::: warning Shortcut conflicts
Make sure the chosen shortcut doesn't conflict with other system applications.
:::

## Transcription language

Whisper automatically detects the spoken language. To force a specific language, configure it in **Settings → Voice to Text → Language**.

## Model storage

Models are stored in:

- **macOS**: `~/Library/Application Support/com.devitools.arandu/whisper-models/`
- **Linux**: `~/.local/share/com.devitools.arandu/whisper-models/`
- **Windows**: `%APPDATA%\com.devitools.arandu\whisper-models\`
