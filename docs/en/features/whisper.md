# Whisper — Voice to Text

Arandu integrates [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for offline voice transcription, directly on the device.

## Why it matters

Working with AI agents requires heavy typing. Formulating prompts, describing bugs, detailing requirements — all of this competes with the time you spend actually developing.

Voice transcription changes this dynamic:

- **Speed**: Speaking is 3x faster than typing
- **Context**: Easier to express nuances in natural language
- **Ergonomics**: Reduces strain on your wrists
- **Privacy**: Everything processes locally, no audio sent to the cloud

## How it works

Arandu includes compiled whisper.cpp — a C++ transcription engine that runs OpenAI's Whisper models directly on your hardware, without needing internet or API keys.

## Using Whisper

### Global shortcut

Press **Alt+Space** (configurable) from anywhere in the system — even with Arandu in the background. The floating recording window appears.

### Recording window

1. The window appears at the top of the screen (always-on-top)
2. Click the microphone or wait for automatic start
3. Speak your text
4. Click to stop — the transcription is copied to the clipboard

### Two output modes

| Mode | Behavior |
|------|----------|
| **Field** | Text is inserted directly into the active text field |
| **Clipboard** | Text is copied — you paste wherever you want |

## Available models

| Model | Size | Speed | Recommendation |
|-------|------|-------|----------------|
| tiny | ~75 MB | Very fast | Quick notes, short commands |
| base | ~140 MB | Fast | General use — **recommended to start** |
| small | ~460 MB | Moderate | Technical content, variable names |
| medium | ~1.5 GB | Slow | Maximum precision, complex documentation |

Models are downloaded automatically on first use (via **Settings → Voice to Text**).

## Privacy

- No audio is sent to external servers
- Models run entirely on the local CPU/GPU
- Audio files are processed in memory and discarded

## Next steps

- [Whisper Configuration](/en/features/whisper-config) — models, devices, shortcuts
