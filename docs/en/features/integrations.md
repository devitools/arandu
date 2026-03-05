# Integrations

## Shell aliases

Configure aliases to integrate Arandu into your workflow:

```bash
# Open project documentation
alias docs='arandu README.md'

# Use Arandu as EDITOR for agents
alias claude='EDITOR=arandu claude'
```

## EDITOR variable

Arandu can be used as the default editor (`$EDITOR`) for any application that opens files for editing:

```bash
export EDITOR=arandu
```

## IPC (Inter-Process Communication)

Arandu exposes two IPC interfaces for automation and integration:

### Unix Socket (macOS/Linux)
```
~/.arandu/arandu.sock
```

### TCP
```
127.0.0.1:7474
```

### Available commands

| Command | Description |
|---------|-------------|
| `open <file>` | Opens a file in Arandu |
| `ping` | Health check |
| `show` | Brings Arandu to focus |

### Usage example

```bash
# Open file via TCP
echo '{"command":"open","args":["README.md"]}' | nc 127.0.0.1 7474

# Health check
echo '{"command":"ping"}' | nc 127.0.0.1 7474
```

## Multi-window

Arandu supports multiple simultaneous windows, each with its own file. This allows comparing documents side by side.

## Editor integrations

### VS Code
Use the integrated task to open the preview in Arandu:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Preview in Arandu",
      "type": "shell",
      "command": "arandu ${file}"
    }
  ]
}
```

### Neovim

```lua
-- Open current file in Arandu
vim.keymap.set('n', '<leader>mp', function()
  vim.fn.system('arandu ' .. vim.fn.expand('%'))
end)
```
