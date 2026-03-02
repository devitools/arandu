# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Arandu is a Markdown viewer and AI-assisted workspace application built with **Tauri** (Rust backend + React/TypeScript/Vite frontend). It uses `comrak` for GFM rendering and integrates with GitHub Copilot via ACP (Agent Communication Protocol).

**Core features:**
- GitHub Flavored Markdown rendering (tables, task lists, strikethrough, autolinks)
- Theme cycling (system/light/dark) with monochrome HSL design system
- File watching with live reload
- Sidebar outline navigation
- Multi-window architecture (main, settings, whisper)
- ACP integration with GitHub Copilot (chat, plan, code, agent modes)
- Session management with SQLite persistence
- Plan review workflow (planning → reviewing → executing)
- Block-based document comment/review system
- Offline voice-to-text via Whisper
- i18n support (pt-BR, en) with cross-window sync
- System tray with i18n-aware menu
- CLI installer for macOS
- Unix domain socket + TCP IPC for external process communication

**IMPORTANT:** The macOS native version (`apps/macos/`) is DEPRECATED. All development happens in the Tauri version (`apps/tauri/`).

## Build Commands

### Tauri (requires Rust + Node.js)

**Using Makefile (recommended):**
```bash
cd apps/tauri
make dev         # run in development mode (Vite hot reload + Tauri)
make build       # production build (uses version from tauri.conf.json)
make build-dev   # local dev build with git hash (e.g. 0.0.0-abc1234)
make install     # install app to ~/Applications + CLI to /usr/local/bin
make clean       # remove build artifacts
make help        # show all available targets
```

**Using npm directly:**
```bash
cd apps/tauri
npm install                          # install frontend dependencies
npm run dev                          # Vite dev server only (no Tauri)
npm run build                        # Vite production build only
npm test                             # run Vitest tests
npm run test:coverage                # run tests with coverage report
npx tauri dev                        # full Tauri dev mode (Vite + Rust)
npx tauri build                      # full production build
```

**Local development builds:**
```bash
./scripts/build-dev.sh               # from repo root; uses git hash as version
```

### Version Management
```bash
scripts/set-version.sh 0.3.0  # updates Info.plist, Cargo.toml, tauri.conf.json, package.json
```

## Project Structure

```text
arandu/
├── .github/workflows/
│   ├── auto-tag.yml              # Auto-versioning from conventional commits
│   ├── release.yml               # GitHub release creation
│   ├── release-tauri.yml         # Multi-platform builds (macOS/Linux/Windows)
│   └── deploy-website.yml        # Cloudflare Pages deployment
├── apps/
│   ├── macos/                    # DEPRECATED - macOS native app (DO NOT USE)
│   └── tauri/                    # Active development
│       ├── index.html            # Main window HTML entry
│       ├── settings.html         # Settings window HTML entry
│       ├── whisper.html          # Whisper window HTML entry
│       ├── vite.config.ts        # Vite multi-page config
│       ├── tailwind.config.ts    # TailwindCSS with HSL theme
│       ├── vitest.config.ts      # Test configuration
│       ├── tsconfig.json         # TypeScript config
│       ├── postcss.config.js     # PostCSS for Tailwind
│       ├── src/                  # React frontend (Vite + TypeScript)
│       │   ├── main.tsx          # Main window entry point
│       │   ├── settings-main.tsx # Settings window entry point
│       │   ├── whisper-main.tsx  # Whisper window entry point
│       │   ├── App.tsx           # Main app component
│       │   ├── SettingsApp.tsx   # Settings app component
│       │   ├── WhisperApp.tsx    # Whisper app component
│       │   ├── index.css         # Global styles + CSS variables (themes)
│       │   ├── vite-env.d.ts     # Tauri type declarations
│       │   ├── components/       # React components
│       │   │   ├── ui/           # shadcn/ui primitives (47 components)
│       │   │   ├── settings/     # Settings page components
│       │   │   ├── TopBar.tsx, HomeScreen.tsx, MarkdownViewer.tsx, ...
│       │   │   ├── TerminalChat.tsx, TerminalInput.tsx, TerminalMessage.tsx
│       │   │   ├── ChatPanel.tsx, PlanPanel.tsx, ReviewPanel.tsx
│       │   │   ├── DirectoryWorkspace.tsx, ActiveSessionView.tsx
│       │   │   └── CommentCard.tsx, SessionCard.tsx, WorkspaceCard.tsx
│       │   ├── contexts/         # React contexts
│       │   │   └── AppContext.tsx # View state, workspace management
│       │   ├── hooks/            # Custom React hooks
│       │   │   ├── useAcpConnection.ts  # ACP connect/disconnect lifecycle
│       │   │   ├── useAcpSession.ts     # ACP message streaming & modes
│       │   │   ├── useComments.ts       # Document comment system
│       │   │   ├── useKeyboardShortcuts.ts # Keyboard shortcut registration
│       │   │   ├── useLocalSessions.ts  # Session CRUD operations
│       │   │   └── usePlanWorkflow.ts   # Plan phase management
│       │   ├── lib/              # Utilities
│       │   │   ├── i18n.ts       # i18next setup, cross-window sync
│       │   │   ├── tray-sync.ts  # Sync tray labels with current language
│       │   │   ├── utils.ts      # cn() class merging utility
│       │   │   ├── format-path.ts # Path formatting with tilde expansion
│       │   │   ├── block-utils.ts # Comment block ID utilities
│       │   │   └── date-locale.ts # date-fns locale mapping
│       │   ├── locales/          # i18n translation files
│       │   │   ├── pt-BR.json    # Portuguese (default)
│       │   │   └── en.json       # English
│       │   ├── types/            # TypeScript type definitions
│       │   │   ├── index.ts      # Workspace, Session, Comment, PlanPhase types
│       │   │   └── acp.ts        # ACP message, session, mode types
│       │   └── __tests__/        # Vitest test files
│       │       ├── setup.ts      # Test setup (Tauri mocks)
│       │       ├── components/   # Component tests
│       │       └── hooks/        # Hook tests
│       ├── src-vanilla/          # Legacy vanilla JS (served as public dir)
│       └── src-tauri/            # Rust backend
│           ├── Cargo.toml
│           ├── tauri.conf.json   # Windows, plugins, capabilities config
│           ├── capabilities/
│           │   └── default.json  # Permission declarations
│           └── src/
│               ├── lib.rs            # App setup, core commands, plugin init
│               ├── main.rs           # Tauri entry point
│               ├── acp/              # Agent Communication Protocol
│               │   ├── mod.rs        # Module re-exports
│               │   ├── connection.rs # JSON-RPC over stdin/stdout
│               │   ├── commands.rs   # Tauri command handlers
│               │   └── types.rs      # JSON-RPC & ACP type definitions
│               ├── sessions.rs       # Session persistence (SQLite)
│               ├── comments.rs       # Review comments (SQLite)
│               ├── plan_file.rs      # Plan file read/write
│               ├── history.rs        # File open history (JSON)
│               ├── ipc_common.rs     # Shared IPC types & command dispatch
│               ├── ipc.rs            # Unix socket IPC (cfg: unix)
│               ├── tcp_ipc.rs        # TCP IPC on 127.0.0.1:7474
│               ├── tray.rs           # System tray icon & menu
│               ├── cli_installer.rs  # macOS CLI installation
│               └── whisper/          # Voice-to-text module
│                   ├── mod.rs, audio.rs, commands.rs
│                   ├── model_manager.rs, transcriber.rs
├── shared/                       # Shared CSS and assets
├── scripts/
│   ├── set-version.sh            # Version management
│   └── build-dev.sh              # Local dev builds with git hash
├── website/                      # Static landing page (Cloudflare Pages)
├── examples/                     # Sample markdown files
├── AGENTS.md                     # Operational guide for AI agents
└── README.md
```

## Architecture

### Frontend (`apps/tauri/src/`)

**Stack:** React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui

**Multi-window architecture** — three independent React applications sharing code:
- **Main window** (`main.tsx` → `App.tsx`): Markdown viewer, workspaces, ACP chat, plan workflow
- **Settings window** (`settings-main.tsx` → `SettingsApp.tsx`): Theme, language, whisper config
- **Whisper window** (`whisper-main.tsx` → `WhisperApp.tsx`): Floating voice recording UI

Each window has its own HTML entry point, React root, and Vite build entry. All share the same i18n setup, CSS variables, and component library.

**State management:**
- `AppContext` — global view state (home/file-expanded/directory-expanded), workspace list
- Custom hooks — each subsystem has its own hook (ACP, sessions, comments, plan)
- localStorage — workspace persistence, language preference
- Tauri invoke — backend communication via `window.__TAURI__.core.invoke()`

**i18n:** i18next with `react-i18next`. Language stored in `localStorage('arandu-language')`. Cross-window sync via `storage` event listener. Tray menu labels synced via `update_tray_labels` Tauri command.

**UI components:** shadcn/ui (Radix primitives + TailwindCSS). Install new ones with `npx shadcn@latest add <component>`. Class merging via `cn()` from `lib/utils.ts`.

### Rust Backend (`apps/tauri/src-tauri/src/`)

**62 Tauri commands** organized into modules:

| Module | Commands | Purpose |
|--------|----------|---------|
| `lib.rs` | 7 | Core: render_markdown, read_file, extract_headings, watch/unwatch_file, get_initial_file, get_home_dir |
| `lib.rs` | 4 | Windows: show/hide_whisper_window, show_settings_window, update_tray_labels |
| `lib.rs` | 2 | Utilities: hash_file, write_clipboard |
| `cli_installer.rs` | 3 | CLI: check_cli_status, install_cli, dismiss_cli_prompt (macOS only) |
| `comments.rs` | 3 | Comments: load_comments, save_comments, count_unresolved_comments |
| `history.rs` | 5 | History: load/save/add_to/remove_from/clear_history |
| `sessions.rs` | 8 | Sessions: session_list/create/get/delete, session_update_acp_id/plan/plan_file_path/phase |
| `plan_file.rs` | 3 | Plans: plan_write, plan_read, plan_path |
| `acp/commands.rs` | 8 | ACP: acp_connect/disconnect, acp_new_session/list_sessions/load_session, acp_send_prompt/set_mode/cancel |
| `whisper/commands.rs` | 19 | Whisper: recording, transcription, model management, settings, audio devices |

**Persistence:**
- SQLite (`comments.db`): comments table, file_hashes table, sessions table (WAL mode)
- JSON (`history.json`): file open history
- Files (`plans/{session_id}.md`): plan documents

**Plugins:** cli, dialog, fs, updater, global-shortcut, clipboard-manager, window-state, single-instance

### ACP Integration

ACP (Agent Communication Protocol) enables communication with GitHub Copilot CLI via JSON-RPC 2.0 over stdin/stdout.

- **Rust side** (`acp/`): `connection.rs` spawns the copilot binary with `--acp --stdio`, manages JSON-RPC requests/responses via Tokio channels. `commands.rs` wraps this as Tauri commands with per-workspace connection state.
- **Frontend side**: `useAcpConnection` hook manages connect/disconnect lifecycle. `useAcpSession` hook handles message streaming, mode switching, and session state. UI components: `TerminalChat`, `TerminalInput`, `TerminalMessage`, `ChatPanel`.
- **Modes:** ask, plan, code, edit, agent, autopilot
- **Plan workflow:** `usePlanWorkflow` hook manages phase transitions (idle → planning → reviewing → executing). `PlanPanel` component for review UI. `plan_file.rs` backend for plan persistence.

### Inter-Process Communication

Two IPC transports sharing common logic (`ipc_common.rs`):

- **Unix socket** (`ipc.rs`): `~/.arandu/arandu.sock`, `#[cfg(unix)]`
- **TCP server** (`tcp_ipc.rs`): `127.0.0.1:7474`, all platforms
- **Commands:** `open` (file), `ping` (health check), `show` (focus window)
- **CLI installer** (`cli_installer.rs`): macOS only, installs bash script to `/usr/local/bin/arandu`

### Website (`website/`)

Static landing page. Primary: Cloudflare Pages (https://arandu.app). Fallback: GitHub Pages. Auto-deploys on push to `main` when `website/**` changes.

## Release Process

Fully automated via conventional commits:
1. Push to `main` → `auto-tag.yml` calculates version (feat=minor, fix=patch) → creates `v*` tag
2. Tag push → `release.yml` creates draft release → `release-tauri.yml` builds 4 targets (macOS ARM/Intel, Linux x86_64, Windows x86_64)
3. All builds succeed → release published → Homebrew Cask updated

## Key Conventions

- **Language:** Project primarily in Portuguese; code and docs in English
- **Bundle ID:** `com.devitools.arandu`
- **macOS deployment target:** 13.0
- **Frontend patterns:**
  - shadcn/ui for all UI primitives (install via `npx shadcn@latest add <component>`)
  - TailwindCSS with HSL CSS variables for theming
  - `cn()` utility from `lib/utils.ts` for class merging
  - `useTranslation()` hook for all user-facing strings
  - `window.__TAURI__.core.invoke()` for Rust calls (`withGlobalTauri: true` in config)
  - `window.__TAURI__.event.listen()` for Rust → JS events
  - Path alias: `@/` maps to `./src/`
- **Backend patterns:**
  - New Tauri commands: define function → register in `invoke_handler` → add permissions to `capabilities/default.json`
  - Conditional compilation: `#[cfg(target_os = "macos")]` for CLI installer, `#[cfg(unix)]` for IPC socket
  - IPC gracefully degrades on failure (logs error, doesn't block startup)
  - SQLite with WAL mode for concurrent access
- **Testing:** Vitest with React Testing Library. Tests in `src/__tests__/`. Mock `window.__TAURI__` in test setup.
- **Multi-window:** Each window has own HTML entry, React root, and Vite build entry. Capabilities must list all window labels. Cross-window state sync via localStorage `storage` event.
