# Arandu

An intelligent development companion — Markdown viewer, AI workspace, and plan review tool. Powered by [Tauri](https://tauri.app), [React](https://react.dev), and [GitHub Copilot](https://github.com/features/copilot).

![macOS](https://img.shields.io/badge/macOS-13%2B-blue)
![Linux](https://img.shields.io/badge/Linux-x86__64-orange)
![Windows](https://img.shields.io/badge/Windows-x86__64-green)

## Features

### Document Viewing
- GitHub Flavored Markdown rendering (tables, task lists, strikethrough, autolinks)
- Syntax highlighting for 190+ languages
- Sidebar outline navigation with smooth scrolling
- Live reload on file save
- Dark / light / system theme cycling

### AI Workspace
- **GitHub Copilot integration** via ACP (Agent Communication Protocol)
- Multiple interaction modes: `ask`, `plan`, `code`, `edit`, `agent`, `autopilot`
- Session management with SQLite persistence — sessions tied to workspace directories
- Plan workflow: write a plan → review → execute, with phase tracking
- Full streaming responses with cancel support

### Plan Review & Comments
- Inline block comments on any Markdown document
- Comments persisted in a central SQLite database
- Unresolved comment counters per file
- Generate consolidated review prompts for AI tools

### Voice to Text
- Built-in offline speech transcription powered by OpenAI Whisper
- Runs locally — no API keys, no internet required
- 4 model sizes (tiny 75 MB to medium 1.5 GB)
- Configurable recording shortcut and audio input device

### CLI
- `arandu README.md` — open files from terminal
- Dual IPC transport: Unix socket (`~/.arandu/arandu.sock`) + TCP (`127.0.0.1:7474`)
- Instant file opening if app is already running; automatic launch fallback
- Installable via Homebrew (macOS) or manual download

### System Tray
- Persistent tray icon with custom "A" glyph
- Localized menu labels (follows app language setting)
- Closing window hides to tray instead of quitting (macOS/Linux)

## Installation

### macOS (Homebrew)

```bash
brew install --cask devitools/arandu/arandu
```

### Manual Download

Download the latest release for your platform from the
[GitHub Releases](https://github.com/devitools/arandu/releases/latest) page:

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Linux | `.AppImage`, `.deb` |
| Windows | `.exe` |

> On first launch (macOS), the app offers to install the `arandu` CLI automatically.
> It can also be installed later via **Arandu → Install Command Line Tool…**

## Usage

### Opening Files

```bash
arandu README.md           # open a single file
arandu doc1.md doc2.md     # open multiple files
arandu *.md                # open all .md files in the current directory
arandu                     # open the file picker
```

### Opening a Workspace

```bash
arandu /path/to/project    # open a directory as a workspace
```

A workspace session gives you access to the GitHub Copilot chat panel, session history, and plan workflow, all scoped to that directory.

## GitHub Copilot Integration

Arandu connects to the GitHub Copilot CLI via the **ACP (Agent Communication Protocol)** — a JSON-RPC 2.0 protocol over stdin/stdout.

### Starting a Session

1. Open a directory as a workspace (`arandu /path/to/project`)
2. Click **New Session**, give it a name and an initial prompt
3. The app spawns `gh copilot --acp --stdio` and establishes the connection
4. Use the **Chat** tab to send messages, switch modes, or cancel generation

### Interaction Modes

| Mode | Description |
|------|-------------|
| `ask` | General questions and explanations |
| `plan` | High-level planning and architecture |
| `code` | Code generation and editing suggestions |
| `edit` | Direct file edits within the workspace |
| `agent` | Autonomous multi-step task execution |
| `autopilot` | Fully autonomous mode |

### Plan Workflow

1. Use `plan` mode to generate a plan in the **Plan** tab
2. Review and annotate the plan with inline comments
3. Switch to `code` or `agent` mode to execute it
4. Track execution progress in the session view

## Plan Review & Comments

Add inline comments to any Markdown block, track unresolved feedback, and generate AI review prompts.

**How to use:**
- `Cmd/Ctrl+Click` any block to select it and add a comment
- The comment panel shows all comments with block-type indicators (`H2`, `P3`, `C4`, …)
- Resolve comments individually or generate a consolidated prompt for AI tools
- All comments are stored in a local SQLite database (`~/.local/share/arandu/comments.db` on Linux, `~/Library/Application Support/arandu/comments.db` on macOS)

## Voice to Text

Record audio and transcribe to text using OpenAI Whisper (runs entirely offline).

**How to use:**
- Press `Alt+Space` to start/stop recording (shortcut configurable in settings)
- Choose a model size in Settings: `tiny` (fastest) to `medium` (most accurate)
- Transcription is automatically copied to the clipboard
- Select your audio input device from the settings panel

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Node.js](https://nodejs.org) 20+

### Quick Start

```bash
cd apps/tauri
npm install        # install frontend dependencies
make dev           # run in development mode (Vite + Tauri hot reload)
```

### Running Tests

```bash
cd apps/tauri
npm test                  # run Vitest tests
npm run test:coverage     # tests with coverage report
```

### Build Commands

**Using Makefile (recommended):**

```bash
cd apps/tauri
make dev           # development mode (hot reload)
make build         # production build
make build-dev     # local dev build with git hash (e.g. Arandu_0.0.0-abc1234.dmg)
make install       # install app to ~/Applications + CLI to /usr/local/bin
make clean         # remove build artifacts
make help          # list all targets
```

**Using npm/npx directly:**

```bash
cd apps/tauri
npm run dev        # Vite dev server only (port 5173)
npx tauri dev      # full Tauri dev mode (Vite + Rust)
npx tauri build    # production build
```

### Version Management

```bash
scripts/set-version.sh 0.8.0   # update version across all config files
```

## Architecture Overview

### Frontend (`apps/tauri/src/`)

**Stack:** React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui (Radix UI)

The app uses a **multi-window architecture** — three independent React applications sharing code:

| Window | Entry | Purpose |
|--------|-------|---------|
| Main | `main.tsx` → `App.tsx` | Markdown viewer, workspaces, ACP chat, plan workflow |
| Settings | `settings-main.tsx` → `SettingsApp.tsx` | Theme, language, Whisper config |
| Whisper | `whisper-main.tsx` → `WhisperApp.tsx` | Floating voice recording UI |

Key libraries:
- **UI:** shadcn/ui components, `cn()` from `lib/utils.ts` for class merging
- **State:** React Context (`AppContext`) + custom hooks per subsystem
- **i18n:** i18next + react-i18next, languages `pt-BR` and `en`, cross-window sync via `localStorage`
- **Forms:** react-hook-form + zod validation
- **Data:** @tanstack/react-query
- **Tests:** Vitest + React Testing Library

### Backend (`apps/tauri/src-tauri/src/`)

**Stack:** Rust + Tauri 2

| Module | Purpose |
|--------|---------|
| `lib.rs` | Core commands: render markdown, file I/O, window management, tray labels |
| `acp/` | GitHub Copilot ACP integration (JSON-RPC over stdin/stdout) |
| `sessions.rs` | Session CRUD with SQLite persistence |
| `comments.rs` | Block comment system with SQLite persistence |
| `plan_file.rs` | Plan file read/write (`plans/{session_id}.md`) |
| `history.rs` | File open history (JSON) |
| `ipc.rs` | Unix domain socket IPC (`~/.arandu/arandu.sock`) |
| `tcp_ipc.rs` | TCP IPC server (`127.0.0.1:7474`, all platforms) |
| `ipc_common.rs` | Shared IPC command dispatch (`open`, `ping`, `show`) |
| `tray.rs` | System tray icon and i18n-aware menu |
| `cli_installer.rs` | macOS CLI installation helper |
| `whisper/` | Offline voice transcription (model management, recording, transcription) |

**Persistence:**
- SQLite (`comments.db`): comments, file hashes, sessions — WAL mode for concurrent access
- JSON (`history.json`): file open history
- Markdown files (`plans/{session_id}.md`): plan documents

## Contributing

For full architecture documentation, command reference, and codebase conventions, see [CLAUDE.md](./CLAUDE.md).

Key points:
- The macOS native app (`apps/macos/`) is **deprecated** — use the Tauri version only
- Frontend is React + TypeScript — no vanilla JS, Vite handles the build
- New Tauri commands: define in Rust → register in `invoke_handler` → add permissions to `capabilities/default.json`
- UI components are from shadcn/ui — add new ones with `npx shadcn@latest add <component>`
- All user-facing strings go through `useTranslation()` and must have entries in both `locales/pt-BR.json` and `locales/en.json`
