# React Conventions

## Component Structure

```
src/components/
├── ui/           # shadcn/ui primitives (47 components, auto-generated)
├── settings/     # Settings window components
│   ├── GeneralSettings.tsx   # Theme + language selection
│   └── WhisperSettings.tsx   # Model download + config
└── *.tsx         # App-level components (21 files)
```

**Naming:** PascalCase filenames matching export name. One component per file.

**Key components by feature:**
- **Markdown viewer:** MarkdownViewer, OutlineSidebar, CommentCard, ReviewPanel
- **Home/workspace:** HomeScreen, WorkspaceCard, DirectoryWorkspace, ActiveSessionView
- **ACP chat:** TerminalChat, TerminalInput, TerminalMessage, ChatPanel, PlanPanel
- **Sessions:** SessionCard, NewSessionForm
- **Shared:** TopBar, StatusBar, ErrorBoundary, ErrorConsole, LoadingSpinner, MicButton

## Custom Hooks (6)

| Hook | Purpose | Tauri Commands |
|------|---------|----------------|
| `useAcpConnection` | Connect/disconnect ACP lifecycle | `acp_connect`, `acp_disconnect` |
| `useAcpSession` | Message streaming, mode switching | `acp_send_prompt`, `acp_set_mode`, `acp_cancel` |
| `useComments` | Block-based comment system | `hash_file`, `load_comments`, `save_comments` |
| `useKeyboardShortcuts` | Register keyboard shortcuts | (none — DOM events) |
| `useLocalSessions` | Session CRUD for workspace | `session_list`, `session_create`, `session_delete` |
| `usePlanWorkflow` | Plan phase transitions | `session_update_plan_file_path`, `session_update_phase`, `plan_path` |

## Context (AppContext)

Single context providing global state:
- `view`: 'home' | 'file-expanded' | 'directory-expanded'
- `workspaces`: Workspace[] (persisted to localStorage `arandu:workspaces`)
- `expandedWorkspaceId`: string | null
- Operations: `openFile()`, `openDirectory()`, `expandWorkspace()`, `minimizeWorkspace()`, `closeWorkspace()`
- File dialog integration via `window.__TAURI__.dialog.open()`
- History tracking via `add_to_history` Tauri command

## shadcn/ui Usage

- Install: `npx shadcn@latest add <component>` (from `apps/tauri/` directory)
- Components go to `src/components/ui/` (auto-generated, don't manually create)
- Built on Radix UI primitives
- Styling via TailwindCSS + CSS variables
- Class merging: `cn()` from `@/lib/utils`
- 47 components installed: accordion, alert, badge, button, card, dialog, dropdown-menu, input, label, popover, scroll-area, select, separator, sheet, sidebar, skeleton, slider, switch, table, tabs, textarea, toast, tooltip, etc.

## Tauri Integration Patterns

**Calling commands:**
```typescript
const result = await window.__TAURI__.core.invoke('command_name', { arg1: 'value' })
```

**Listening to events:**
```typescript
useEffect(() => {
  const unlisten = window.__TAURI__.event.listen('event-name', (event) => {
    // handle event.payload
  })
  return () => { unlisten.then(fn => fn()) }
}, [])
```

**Window management:**
```typescript
const currentWindow = window.__TAURI__.window.getCurrentWindow()
await currentWindow.hide()
await currentWindow.show()
```

**Type declarations** in `vite-env.d.ts` provide types for `window.__TAURI__`.

## Testing

**Framework:** Vitest + React Testing Library

**File layout:**
```
src/__tests__/
├── setup.ts              # Global setup (Tauri mocks)
├── components/           # Component tests (*. test.tsx)
│   ├── TopBar.test.tsx
│   ├── HomeScreen.test.tsx
│   ├── MarkdownViewer.test.tsx
│   ├── ChatPanel.test.tsx
│   └── ... (10 test files)
└── hooks/                # Hook tests (*.test.ts)
    ├── useComments.test.ts
    └── useKeyboardShortcuts.test.ts
```

**Tauri mocking:** `setup.ts` provides mock `window.__TAURI__` with default implementations.
Override per-test with `vi.mocked()`.

## TypeScript Types

**`types/index.ts`:** Workspace, Heading, Session, Message, Comment, CommentsData, PlanPhase, SessionRecord, SessionTab

**`types/acp.ts`:** AcpSessionMode, AcpSessionModeState, AcpSessionInfo, AcpSessionSummary, AcpSessionUpdate, AcpMessage

## Utility Libraries

| File | Export | Purpose |
|------|--------|---------|
| `lib/utils.ts` | `cn()` | Tailwind class merging (clsx + tailwind-merge) |
| `lib/i18n.ts` | default i18n | i18next init, cross-window sync |
| `lib/tray-sync.ts` | `updateTrayLabels()` | Sync tray menu with language |
| `lib/format-path.ts` | `shortenPath()`, `initHomeDir()` | Path display with ~ |
| `lib/block-utils.ts` | `blockLabel()`, `scrollToBlock()` | Comment block utilities |
| `lib/date-locale.ts` | `getDateLocale()` | date-fns locale mapping |
