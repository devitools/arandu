# Live Reload

Arandu watches the open file and automatically updates the preview when the file is modified.

## How it works

1. You open a `.md` file in Arandu
2. Edit the file in any editor (VS Code, Vim, nano, etc.)
3. On save, Arandu detects the change and re-renders instantly

No browser extension or special configuration is required.

## Implementation

File watching is implemented in the Rust backend using the [notify](https://docs.rs/notify/) crate. Arandu monitors the file via inotify (Linux), FSEvents (macOS), or ReadDirectoryChangesW (Windows).

## Use cases

### Editing with VS Code

```bash
code my-document.md    # open in VS Code
arandu my-document.md  # open preview in Arandu
```

Edit in VS Code, see the result in Arandu in real time.

### Pipeline with scripts

```bash
# Generate Markdown and open preview
python generate-report.py > report.md
arandu report.md
```

### With AI agents

When a coding agent is generating or editing a `.md` plan, Arandu displays the changes in real time.

## Behavior

- Scroll position is preserved after reload (when possible)
- If the file is deleted, Arandu displays a warning message
- Watching is automatically cancelled when the window is closed
