# AGENTS.md

Operational guide for AI agents working on the Arandu codebase.

## Quick Reference

```bash
cd apps/tauri
make dev                    # full dev mode (Vite + Tauri hot reload)
npm run dev                 # Vite dev server only (port 5173)
npm test                    # run Vitest tests
npm run test:coverage       # tests with coverage
make build                  # production build
npx tauri build             # production build (alternative)
```

## Adding a New Tauri Command

1. **Define the Rust function** in the appropriate module (e.g., `src-tauri/src/lib.rs` or a feature module):
   ```rust
   #[tauri::command]
   pub fn my_command(arg: String) -> Result<String, String> {
       Ok(format!("Hello {}", arg))
   }
   ```

2. **Register in `invoke_handler`** in `lib.rs` (around line 618):
   ```rust
   .invoke_handler(tauri::generate_handler![
       // ... existing commands
       my_command,
   ])
   ```

3. **Add permissions** in `src-tauri/capabilities/default.json` if the command needs specific capabilities (core commands generally don't need extra permissions).

4. **Call from frontend:**
   ```typescript
   const result = await window.__TAURI__.core.invoke('my_command', { arg: 'world' })
   ```

**If the command is in a submodule** (e.g., `acp/commands.rs`), import it with the module path:
```rust
use crate::acp::commands::my_command;
```

## Adding a New React Component

**Placement:**
- `src/components/` — app-level components
- `src/components/ui/` — shadcn/ui primitives only (generated, don't manually create)
- `src/components/settings/` — settings window components

**Conventions:**
- One component per file, PascalCase filename matching component name
- Use `cn()` from `@/lib/utils` for conditional classes
- Use `useTranslation()` for all user-facing text
- Access Tauri via `window.__TAURI__` (typed in `vite-env.d.ts`)

**Adding a shadcn/ui component:**
```bash
cd apps/tauri
npx shadcn@latest add button    # installs to src/components/ui/button.tsx
```

## Adding a New Translation Key

1. Add the key to **both** locale files:
   - `src/locales/pt-BR.json` (Portuguese — default/fallback)
   - `src/locales/en.json` (English)

2. Use the same nested key structure. Group by feature:
   ```json
   {
     "myFeature": {
       "title": "My Feature",
       "description": "Feature description"
     }
   }
   ```

3. In components:
   ```typescript
   const { t } = useTranslation()
   return <h1>{t('myFeature.title')}</h1>
   ```

4. If the key appears in the **tray menu**, also update `lib/tray-sync.ts` and the `update_tray_labels` Rust command.

## Adding a New Custom Hook

- Place in `src/hooks/`
- Prefix with `use` (e.g., `useMyFeature.ts`)
- If it calls Tauri commands, use `window.__TAURI__.core.invoke()`
- If it listens to Tauri events, use `window.__TAURI__.event.listen()` and clean up in the return of `useEffect`

## Multi-Window Considerations

Arandu has three windows, each with its own React root:

| Window | HTML Entry | React Entry | Component | Label |
|--------|-----------|-------------|-----------|-------|
| Main | `index.html` | `main.tsx` | `App.tsx` | `main` |
| Settings | `settings.html` | `settings-main.tsx` | `SettingsApp.tsx` | `settings` |
| Whisper | `whisper.html` | `whisper-main.tsx` | `WhisperApp.tsx` | `whisper` |

**Key rules:**
- Each window imports `lib/i18n.ts` independently — language syncs via `localStorage` `storage` event
- Vite build entries are defined in `vite.config.ts` under `build.rollupOptions.input`
- Window labels must be listed in `src-tauri/capabilities/default.json` for permissions to apply
- Windows are defined in `tauri.conf.json` under `app.windows`
- Settings and Whisper windows **hide** on close (not destroy) — they're re-shown when needed

**To add a new window:**
1. Create `<name>.html` at `apps/tauri/` root
2. Create `src/<name>-main.tsx` entry point
3. Create `src/<Name>App.tsx` component
4. Add to `vite.config.ts` `rollupOptions.input`
5. Add window definition to `tauri.conf.json`
6. Add window label to `capabilities/default.json`

## Common Gotchas

- **Capabilities must list window labels**: If a new window can't call Tauri commands, check that its label is in `capabilities/default.json`
- **`withGlobalTauri: true`** is set in `tauri.conf.json` — this exposes `window.__TAURI__` globally; no imports needed
- **Conditional compilation in Rust**: Use `#[cfg(target_os = "macos")]` for macOS-only code, `#[cfg(unix)]` for Unix-only. Don't forget to conditionally register the commands in `invoke_handler` too
- **SQLite WAL mode**: The database uses WAL for concurrent reads. Don't open the DB file externally while the app is running
- **Vite port 5173** is set to `strict: true` — if the port is taken, the dev server fails instead of picking another port
- **Path alias**: Use `@/` prefix for imports (maps to `src/`). Configured in both `vite.config.ts` and `tsconfig.json`
- **Public dir**: `src-vanilla/` is served as the Vite public directory (legacy whisper HTML fallback)
- **Theme**: Uses `next-themes` with class-based dark mode. CSS variables defined in `index.css` under `:root` (light) and `.dark` (dark)

## Testing

**Setup:** Vitest + React Testing Library

**File locations:**
- `src/__tests__/setup.ts` — global test setup (mocks `window.__TAURI__`)
- `src/__tests__/components/` — component tests
- `src/__tests__/hooks/` — hook tests

**Running tests:**
```bash
cd apps/tauri
npm test                    # watch mode
npm run test:coverage       # with coverage report
```

**Mocking Tauri in tests:**
The test setup file (`setup.ts`) provides mock implementations for `window.__TAURI__`. When testing a component that calls `invoke()`, the mock is already available. For specific return values, override in individual tests:
```typescript
vi.mocked(window.__TAURI__.core.invoke).mockResolvedValue('expected')
```

## Development Patterns

Reusable patterns extracted from the codebase. Each solves a real problem with a tested approach.

### 1. Streamed Content Accumulation with Idle Timer Debounce
**File:** `src/hooks/useAcpSession.ts`

**Problem:** Streaming APIs send rapid-fire chunks that cause render jank and need "stream complete" detection.

**Technique:**
- Accumulate chunks by appending to last message if same role/type, else create new message
- 800ms idle timer (`setTimeout`) resets on every chunk; if no chunk arrives, mark `isStreaming = false`
- `end_turn` event clears timer immediately
- Use `useRef` for session ID to avoid stale closures in event listeners

### 2. Phase State Machine with Mode Routing
**File:** `src/hooks/usePlanWorkflow.ts`

**Problem:** Multi-stage workflows need clear phase boundaries and different agent modes per phase.

**Technique:**
- Explicit phases: idle → planning → reviewing → executing
- Each transition: look up mode → switch agent mode → update local state → persist to backend → trigger action
- Ref-based callbacks (`sendPromptRef`, `setModeRef`) to avoid dependency array churn
- Hardcoded fallback modes if lookup fails (best-effort graceful degradation)

### 3. Queued Saving with File Staleness Detection
**File:** `src/hooks/useComments.ts`

**Problem:** Rapid mutations (add/resolve/delete) cause race conditions with async saves; external file edits invalidate comments.

**Technique:**
- Promise queue: `saveQueue.current = saveQueue.current.then(async () => { ... })` — FIFO ordering via chaining
- Trigger save inside `setState` functional updater to capture latest state
- Two hashes: `savedHash` (when comments last saved) vs `fileHash` (current file on disk) — mismatch = stale
- `refreshHash()` for on-demand staleness checks (e.g., on file-watcher events)

### 4. Cross-Layer i18n Sync (React ↔ localStorage ↔ Rust)
**Files:** `src/lib/i18n.ts`, `src/lib/tray-sync.ts`

**Problem:** Three UI layers (React, browser storage, Rust tray) need synchronized language state.

**Technique:**
- React → localStorage: `i18n.on('languageChanged', lng => localStorage.setItem(key, lng))`
- localStorage → React: `window.addEventListener('storage', e => i18n.changeLanguage(e.newValue))` (cross-window sync)
- React → Rust: `updateTrayLabels(lng)` sends translated strings via `invoke("update_tray_labels", {...})`
- Pure bridge function decoupled from i18next internals

### 5. JSON-RPC over stdin/stdout with Pending Requests Map
**File:** `src-tauri/src/acp/connection.rs`

**Problem:** Full-duplex async RPC with child process where responses arrive out-of-order.

**Technique:**
- `PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result>>>>` — correlate responses by ID
- Split reader/writer Tokio tasks (avoids deadlock from unified I/O)
- Writer: receives serialized JSON via `mpsc` channel, writes to stdin
- Reader: parses line-delimited JSON, routes by type (response → pending map, notification → app event, request → auto-respond)
- 30s `tokio::time::timeout` on pending receivers

### 6. Workspace Deduplication and Persistence
**File:** `src/contexts/AppContext.tsx`

**Problem:** Opening same file twice creates duplicate entries; workspace list lost on restart.

**Technique:**
- On open: check `workspaces.find(w => w.type === type && w.path === path)` — if found, focus + update `lastAccessed`
- If not found: create with timestamp ID (`file-${Date.now()}`)
- Auto-serialize to localStorage on every state change via `useEffect`
- On close: unwatch file in backend, remove from state, collapse to home if was expanded
- Date revival: `new Date(w.lastAccessed)` when deserializing from JSON

### 7. Tauri API Mocking for Tests
**File:** `src/__tests__/setup.ts`

**Problem:** Components call `window.__TAURI__` APIs that don't exist in test environment.

**Technique:**
- Define `globalThis.__TAURI__` with `vi.fn()` mocks for: `core.invoke`, `window.getCurrentWindow`, `dialog.open`, `event.listen`
- `event.listen` returns `Promise.resolve(() => {})` (unlisten function)
- Mock browser APIs: `matchMedia`, `IntersectionObserver`, `ResizeObserver`
- Override per-test: `vi.mocked(window.__TAURI__.core.invoke).mockResolvedValue('expected')`

### 8. Component Tagger Vite Plugin
**File:** `vite.config.ts` (lines 5-77)

**Problem:** Can't trace rendered DOM elements back to source files during debugging.

**Technique:**
- Custom Vite plugin (`enforce: "pre"`, `apply: "serve"` — dev only)
- Regex-based JSX transform: injects `data-id="src/Component.tsx:42"` on all tags
- Adds `data-component="ComponentName"` on root return element
- Skips: node_modules, test files, comment lines, content inside quoted strings (quote-count heuristic)
- Zero overhead in production (not applied during build)

## Tauri Command Categories

For reference, the 62 registered commands by module:

| Module | Count | Examples |
|--------|-------|---------|
| Core (lib.rs) | 13 | render_markdown, watch_file, hash_file, show_settings_window |
| CLI (cli_installer.rs) | 3 | check_cli_status, install_cli, dismiss_cli_prompt |
| Comments (comments.rs) | 3 | load_comments, save_comments, count_unresolved_comments |
| History (history.rs) | 5 | load_history, add_to_history, clear_history |
| Sessions (sessions.rs) | 8 | session_list, session_create, session_update_phase |
| Plans (plan_file.rs) | 3 | plan_write, plan_read, plan_path |
| ACP (acp/commands.rs) | 8 | acp_connect, acp_send_prompt, acp_set_mode |
| Whisper (whisper/) | 19 | start_recording, stop_and_transcribe, load_whisper_model |
