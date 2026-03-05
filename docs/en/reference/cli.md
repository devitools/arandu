# CLI — Command Line Tool

## Installation

The CLI is installed automatically on first launch of Arandu (macOS), or can be installed via the **Arandu → Install Command Line Tool…** menu.

Via Homebrew:
```bash
brew install --cask devitools/arandu/arandu
```

## Basic usage

```bash
arandu                          # open the file picker
arandu README.md                # open a file
arandu doc1.md doc2.md          # open multiple files
arandu *.md                     # open all .md files in directory
arandu /path/to/project         # open as workspace
```

## Flags

| Flag | Description |
|------|-------------|
| `--version` | Display the installed version |
| `--help` | Display help |

## Behavior

- If Arandu is already running, files are opened via IPC (no new app window)
- If Arandu is not running, the app is launched automatically

## Installation path

| System | Path |
|--------|------|
| macOS | `/usr/local/bin/arandu` |
| Linux | `~/.local/bin/arandu` |

## CLI script

The CLI is a shell script that communicates with Arandu via IPC:

```bash
#!/bin/bash
# Try via Unix socket, fallback to TCP
if [ -S "$HOME/.arandu/arandu.sock" ]; then
  echo '{"command":"open","args":["'"$1"'"]}' \
    | socat - UNIX-CONNECT:$HOME/.arandu/arandu.sock
else
  echo '{"command":"open","args":["'"$1"'"]}' | nc 127.0.0.1 7474
fi
```
