# Tauri Patterns & Gotchas

## Tauri Command Registration Flow

1. Define `#[tauri::command]` function in Rust module
2. Register in `lib.rs` → `.invoke_handler(tauri::generate_handler![...])` (around line 618)
3. Add permissions in `src-tauri/capabilities/default.json` if needed
4. Call from JS: `window.__TAURI__.core.invoke('command_name', { args })`

Commands in submodules need `use crate::module::command_name;` import.

## Multi-Window Setup

**Vite entry points** (`vite.config.ts`):
```
rollupOptions.input = { main: index.html, settings: settings.html, whisper: whisper.html }
```

**Window definitions** (`tauri.conf.json` → `app.windows`):
- `main`: titleBarStyle "Overlay", hiddenTitle, visible false on startup
- `settings`: 600x520, center, visible false (shown via `show_settings_window`)
- `whisper`: 600x160, alwaysOnTop, no decorations, transparent, visible false

**Capabilities** (`capabilities/default.json`):
- `windows: ["main", "whisper", "settings"]` — all three must be listed
- Permissions include: core, cli, dialog, fs, updater, global-shortcut, clipboard-manager, window-state

## Cross-Window Communication

- **Language sync**: localStorage key `arandu-language`, `storage` event listener in `lib/i18n.ts`
- **Tauri events**: Rust → JS via `app.emit("event-name", payload)`, listened with `window.__TAURI__.event.listen()`
- **Window management**: Settings/whisper hide on close, re-shown with `show_settings_window`/`show_whisper_window` commands

## System Tray

- Custom "A" glyph rendered procedurally in Rust (SDF math, 36x36 RGBA)
- macOS: `icon_as_template(true)` for system appearance integration
- Menu items: Show Window, Record (with shortcut label), Settings, Quit
- Labels update dynamically for i18n via `update_tray_labels` command
- Left-click → show main window
- Record toggle → emits events + manages recording state

## File Watching

- Uses `notify` crate (recommended_watcher)
- `watch_file(path)` → canonicalizes path, registers with watcher
- `unwatch_file(path)` → removes from watcher
- Emits `file-changed` event to frontend on modification
- De-duplicates by canonical path

## SQLite Persistence

**Database:** `{app_data_dir}/comments.db` with WAL mode

**Tables:**
- `comments`: id, file_path, block_ids (JSON array), text, timestamp, resolved
- `file_hashes`: file_path, file_hash (SHA256 for staleness detection)
- `sessions`: id, workspace_path, acp_session_id, name, initial_prompt, plan_markdown, plan_file_path, phase, created_at, updated_at

**Migrations:** `init_sessions_table()` adds `plan_file_path` column if missing. Legacy `.comments.json` files auto-migrated to DB.

**State:** `CommentsDb(Mutex<Connection>)` managed as Tauri state, shared by comments and sessions modules.

## IPC Architecture

Two transports sharing `ipc_common.rs`:
- **Unix socket** (`ipc.rs`): `~/.arandu/arandu.sock`, `#[cfg(unix)]`, Tokio async
- **TCP server** (`tcp_ipc.rs`): `127.0.0.1:7474`, all platforms
- JSON protocol, commands: open, ping, show
- Graceful cleanup on quit, non-blocking on failure

## App Lifecycle

- Window close → hide (not quit), tray stays active
- ExplicitQuit flag → clean up IPC/ACP connections → `exit(0)`
- macOS Reopen event → show main window
- Single instance plugin → second instance focuses existing window
- CLI args (`--file`) → stored in `InitialFile` state → consumed by `get_initial_file` command
- macOS file association click → `Opened` event → emits `open-file` to frontend

## Conditional Compilation

- `#[cfg(target_os = "macos")]`: cli_installer, app menu, Opened events
- `#[cfg(unix)]`: IPC socket server
- `#[cfg_attr(mobile, tauri::mobile_entry_point)]`: mobile support marker
- Commands using conditional modules must also be conditionally registered in invoke_handler

## Plugins (8 total)

cli, dialog, fs, updater, global-shortcut, clipboard-manager, window-state, single-instance

Window-state plugin excludes "whisper" and "settings" windows from state persistence.
