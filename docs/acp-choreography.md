# ACP Choreography — Message Flow & Timers

This document describes the full choreography of the Agent Communication Protocol
integration: how user messages, streaming chunks, persistence, and rendering
interact across the Rust backend, session-cache, React hooks, and UI components.

> **Architecture:** Per-session connections. Each Arandu session spawns its own
> `copilot` child process communicating via JSON-RPC 2.0 over stdin/stdout.

---

## 1. Connection Establishment

```
 ActiveSessionView      useSessionConnection      Rust (commands.rs)           Copilot Binary
       │                        │                         │                          │
       │── doInit() ───────────►│                         │                          │
       │                        │── acp_session_connect ─►│                          │
       │                        │                         │── spawn(copilot) ───────►│
       │                        │                         │◄──── stdin/stdout ───────│
       │                        │                         │                          │
       │                        │                         │── "initialize" ─────────►│
       │                        │                         │◄──── init result ────────│
       │                        │                         │── "initialized" ────────►│
       │                        │                         │                          │
       │                        │                         │── "session/new" ────────►│
       │                        │                         │   (or "session/load")    │
       │                        │                         │◄──── SessionInfo ────────│
       │                        │                         │   { session_id, modes }  │
       │                        │                         │                          │
       │                        │◄── copilot_session_id ──│                          │
       │◄── acpSessionId ──────│                         │                          │
       │                        │                         │                          │
       │ updateSessionEntry()   │                         │                          │
       │ session_update_acp_id  │                         │                          │
       │ plan.startPlanning()   │                         │                          │
```

**Key files:**
- `ActiveSessionView.tsx` — `doInit()` orchestrates connection + initial prompt
- `useSessionConnection.ts` — `connect()` calls `acp_session_connect`
- `acp/commands.rs` — `acp_session_connect` spawns process, initializes, creates/loads session
- `acp/connection.rs` — `AcpConnection::spawn()` sets up reader/writer Tokio tasks

**Per-session store** (`AcpSessionStore`):
- `IndexMap<session_id, AcpSessionInstance>` — ordered by insertion (LRU eviction)
- Max 10 concurrent instances; oldest evicted when cap reached
- Each instance holds: `Arc<AcpConnection>`, `acp_session_id`, `last_activity`

---

## 2. Sending a User Message

```
 UI (ActiveSessionView)      Rust (commands.rs)     Rust (connection.rs)      SQLite        useSessionMessages
       │                           │                        │                   │                  │
       │── sendPrompt(text) ──────►│                        │                   │                  │
       │   invoke("acp_session_    │                        │                   │                  │
       │    send_prompt")          │                        │                   │                  │
       │                           │── conn.send_prompt() ─►│                   │                  │
       │                           │                        │── save_message() ►│                  │
       │                           │                        │◄── MessageRecord ─│                  │
       │                           │                        │    { id: UUID }   │                  │
       │                           │                        │                   │                  │
       │                           │                        │── emit("acp:user-message-saved") ──►│
       │                           │                        │   { sessionId, id, content }        │
       │                           │                        │                   │                  │
       │                           │                        │                   │     setDbMessages(
       │                           │                        │                   │      prev => [...prev, msg])
       │                           │                        │                   │                  │
       │◄──────────────── message appears in TerminalChat ────────────────────────────────────────│
       │                           │                        │                   │                  │
       │                           │                        │── JSON-RPC ──────►Copilot            │
       │                           │                        │   "session/prompt"                   │
       │                           │                        │   { text }                           │
```

**Single source of truth:** The user message is written to SQLite exactly once
(in `connection.rs:send_prompt`), then an event notifies the frontend. No optimistic
writes, no dual-write race conditions.

**Key files:**
- `ActiveSessionView.tsx:sendPrompt` — calls `acp_session_send_prompt` (no optimistic msg)
- `acp/connection.rs:send_prompt` — saves to DB, emits event, sends JSON-RPC
- `useSessionMessages.ts` — listens to `"acp:user-message-saved"`, appends to `dbMessages`

---

## 3. Streaming Response (Chunks)

```
 Copilot         Rust (reader_task)         session-cache           useSessionMessages      TerminalMessage
    │                   │                        │                        │                       │
    │── agent_message   │                        │                        │                       │
    │   _chunk ────────►│                        │                        │                       │
    │                   │── accumulate in        │                        │                       │
    │                   │   streaming_buffer     │                        │                       │
    │                   │                        │                        │                       │
    │                   │── emit("acp:session    │                        │                       │
    │                   │   -update") ──────────►│                        │                       │
    │                   │                        │── processSessionUpdate │                       │
    │                   │                        │   append text to last  │                       │
    │                   │                        │   live message         │                       │
    │                   │                        │   isStreaming = true   │                       │
    │                   │                        │                        │                       │
    │                   │                        │── resetStreamingTimer  │                       │
    │                   │                        │   (60s hard timeout)   │                       │
    │                   │                        │── resetFormatTimer     │                       │
    │                   │                        │   (5s idle timeout)    │                       │
    │                   │                        │                        │                       │
    │                   │                        │── notify subscribers ─►│                       │
    │                   │                        │                        │── setLiveMessages ───►│
    │                   │                        │                        │                       │
    │                   │                        │                        │          ┌─────────────────────┐
    │                   │                        │                        │          │ isStreaming && isLast│
    │                   │                        │                        │          │ → plain text        │
    │                   │                        │                        │          │   (whitespace-      │
    │                   │                        │                        │          │    pre-wrap)        │
    │                   │                        │                        │          │ + streaming-cursor  │
    │                   │                        │                        │          └─────────────────────┘
    │                   │                        │                        │                       │
    │── next chunk ────►│  ← ← ← ← cycle repeats for each chunk → → → →│                       │
    │                   │                        │                        │                       │
```

**Rendering strategy:** During streaming, `AgentMessage` renders plain text
(`whitespace-pre-wrap`) instead of parsing markdown on every chunk. This avoids
O(n^2) total work from re-parsing the entire accumulated string on each chunk.

**Key files:**
- `acp/connection.rs:reader_task` — accumulates chunks in `streaming_buffer`
- `session-cache.ts:processSessionUpdate` — builds live message array
- `useSessionMessages.ts` — merges `dbMessages` + `liveMessages`
- `TerminalMessage.tsx:AgentMessage` — conditional rendering (plain vs markdown)

---

## 4. End Turn (Streaming → Persisted)

```
 Copilot         Rust (reader_task)         session-cache          useSessionMessages      TerminalMessage
    │                   │                        │                       │                       │
    │── end_turn ──────►│                        │                       │                       │
    │                   │                        │                       │                       │
    │                   │── save_message()       │                       │                       │
    │                   │   (streaming_buffer    │                       │                       │
    │                   │    → SQLite as         │                       │                       │
    │                   │    "assistant" msg)    │                       │                       │
    │                   │                        │                       │                       │
    │                   │── emit("acp:session    │                       │                       │
    │                   │   -update") ──────────►│                       │                       │
    │                   │                        │── isStreaming = false  │                       │
    │                   │                        │── msgs.splice(0)      │                       │
    │                   │                        │   (clear live buffer)  │                       │
    │                   │                        │                        │                       │
    │                   │                        │── clearStreamingTimer  │                       │
    │                   │                        │── clearFormatTimer     │                       │
    │                   │                        │                        │                       │
    │                   │                        │── notify subscribers ─►│                       │
    │                   │                        │                        │                       │
    │                   │                        │   (!isStreaming &&     │                       │
    │                   │                        │    msgs.length === 0)  │                       │
    │                   │                        │         ▼              │                       │
    │                   │                        │   setTimeout(250ms) ─►│                       │
    │                   │                        │                       │── loadInitial()       │
    │                   │                        │                       │   invoke("messages_   │
    │                   │                        │                       │    list") ────► SQLite │
    │                   │                        │                       │◄── all messages ──────│
    │                   │                        │                       │                       │
    │                   │                        │                       │── setDbMessages ─────►│
    │                   │                        │                       │   setLiveMessages([]) │
    │                   │                        │                       │                       │
    │                   │                        │                       │          ┌─────────────────────┐
    │                   │                        │                       │          │ !isStreaming         │
    │                   │                        │                       │          │ → <Markdown>        │
    │                   │                        │                       │          │   (full rendering)  │
    │                   │                        │                       │          └─────────────────────┘
```

**Transition:** When `end_turn` arrives, the Rust reader saves the accumulated
assistant message to SQLite, then emits the event. The session-cache clears its
live buffer and sets `isStreaming = false`. The hook detects this (empty buffer +
not streaming) and reloads all messages from SQLite after 250ms. The UI switches
from plain text to rendered `<Markdown>`.

---

## 5. Timer System

Two independent timer layers protect against stuck streams:

```
                    ┌──────────────────────────────────────────────────────────────────┐
                    │                     session-cache.ts                             │
                    │                                                                  │
  chunk arrives ──►│  ┌─ FORMAT_IDLE_MS (5s) ─────────────────────────┐               │
                    │  │  Reset on every chunk.                        │               │
                    │  │  Fires when no chunks arrive for 5 seconds.  │               │
                    │  │  Effect: isStreaming = false                  │               │
                    │  │          → UI renders <Markdown>             │               │
                    │  │          → buffer NOT cleared                │               │
                    │  │          (waits for real end_turn)           │               │
                    │  └──────────────────────────────────────────────┘               │
                    │                                                                  │
  chunk arrives ──►│  ┌─ STREAMING_TIMEOUT_MS (60s) ─────────────────┐               │
                    │  │  Reset on every chunk.                        │               │
                    │  │  Fires if stream appears completely dead.     │               │
                    │  │  Effect: isStreaming = false                  │               │
                    │  │          → same as above                     │               │
                    │  └──────────────────────────────────────────────┘               │
                    │                                                                  │
   end_turn ──────►│  Both timers cleared immediately.                                │
                    │  isStreaming = false, buffer cleared.                             │
                    └──────────────────────────────────────────────────────────────────┘
```

| Timer | Constant | Default | Purpose | Effect |
|-------|----------|---------|---------|--------|
| Format idle | `FORMAT_IDLE_MS` | 5,000 ms | Auto-format markdown when chunks stop arriving | `isStreaming = false` (renders markdown, keeps buffer) |
| Streaming timeout | `STREAMING_TIMEOUT_MS` | 60,000 ms | Hard safety net for completely dead streams | `isStreaming = false` (same effect, broader window) |

**To adjust the format idle timeout**, change `FORMAT_IDLE_MS` in
`src/lib/session-cache.ts`. This controls how quickly markdown renders
after the last streaming chunk when `end_turn` hasn't arrived yet.

---

## 6. Plan Workflow & Mode Switching

The copilot starts in its **default mode** (ask). Mode changes happen
only at specific phase transitions, never during session initialization.

```
 Phase          Mode               Trigger                  Who switches
─────────────────────────────────────────────────────────────────────────
 idle           (default/ask)      session created           —
    │
    ▼
 planning       (default/ask)      startPlanning()           NO mode change
    │                              sends initial prompt      copilot plans
    │                              in default mode           naturally
    ▼
 reviewing      (default/ask)      isStreaming → false        —
    │                              user reviews the plan
    │
    ├──► requestChanges()          stays in default mode     NO mode change
    │    sends feedback prompt     copilot revises plan
    │    → back to planning
    │
    ▼
 executing      agent              approvePlan()             setMode("agent")
    │                              ONLY here the mode        via session/set_mode
    │                              changes to agent          JSON-RPC
    ▼
 done           agent              user marks complete       —
```

```
 usePlanWorkflow          ActiveSessionView          Rust              Copilot
       │                        │                      │                  │
       │◄── startPlanning() ────│                      │                  │
       │    (no setMode!)       │                      │                  │
       │── setPhase("planning") │                      │                  │
       │── sendPrompt(text) ───►│── invoke ───────────►│── JSON-RPC ────►│
       │                        │                      │  (default mode)  │
       │                        │                      │                  │
       │    ... streaming plan response ...            │                  │
       │                        │                      │                  │
       │◄── approvePlan() ──────│ (user clicks approve)│                  │
       │── setMode("agent") ───►│── invoke ───────────►│── set_mode ────►│
       │── setPhase("executing")│                      │  (agent mode)   │
       │── sendPrompt("approved") ►│── invoke ────────►│── prompt ──────►│
       │                        │                      │                  │
```

**Key design decision:** The copilot operates in its default mode during
planning. This avoids race conditions with `availableModes` not being
populated yet at session startup, and ensures the mode only changes
with explicit user approval.

**Key files:**
- `usePlanWorkflow.ts` — `startPlanning()` (no mode change), `approvePlan()` (sets agent mode)
- `ActiveSessionView.tsx` — `doInit()` calls `startPlanning()` when phase is idle

---

## 7. Message Lifecycle (State Layers)

Messages exist in two state layers that are merged for display:

```
┌─────────────────────────────────────────────────────┐
│ useSessionMessages                                  │
│                                                     │
│  dbMessages (SQLite-backed)                         │
│  ┌─────────────────────────────────────────────┐    │
│  │ user msg (via acp:user-message-saved event) │    │
│  │ assistant msg (via loadInitial after end_turn│    │
│  │ tool calls, thinking (via loadInitial)       │    │
│  └─────────────────────────────────────────────┘    │
│           +                                         │
│  liveMessages (session-cache in-memory)             │
│  ┌─────────────────────────────────────────────┐    │
│  │ streaming assistant chunks (accumulating)    │    │
│  │ tool call status updates                     │    │
│  │ thinking chunks                              │    │
│  │ → cleared on end_turn                        │    │
│  └─────────────────────────────────────────────┘    │
│           =                                         │
│  messages = [...dbMessages, ...liveMessages]        │
│           │                                         │
│           ▼                                         │
│  TerminalChat → TerminalMessage[]                   │
└─────────────────────────────────────────────────────┘
```

---

## 8. Rendering Decision Tree

```
TerminalMessage receives { message, isLast, isStreaming }
    │
    ├── message.role === "user"
    │   └── plain text (with collapsible <details> if multiline)
    │
    ├── message.type === "tool"
    │   └── tool status indicator (dot + title + optional output)
    │
    ├── message.type === "thinking"
    │   └── <details> with <Markdown> (always rendered, collapsed)
    │
    ├── message.type === "notice"
    │   └── <Markdown> (muted style)
    │
    └── default (assistant)  →  AgentMessage
        │
        ├── isLast && isStreaming?
        │   ├── YES → <span class="whitespace-pre-wrap">{content}</span>
        │   │         + <span class="streaming-cursor" />
        │   │         (plain text, no markdown parsing)
        │   │
        │   └── NO  → <Markdown remarkPlugins={[remarkGfm]}>
        │              {content}
        │             </Markdown>
        │             (full GFM rendering: tables, code, lists)
```

---

## 9. Heartbeat & Health Monitoring

```
 heartbeat_task (Tokio)                    Copilot
       │                                      │
       │── (every 60s) ─────────────────────►│
       │   check: process alive?              │
       │   check: idle > 45s?                 │
       │                                      │
       │── ping (if idle) ──────────────────►│
       │                                      │
       │   ┌─ OK (< 10s) ──────────────────┐ │
       │   │  emit "acp:heartbeat" healthy  │ │
       │   │  reset consecutive_failures    │ │
       │   └────────────────────────────────┘ │
       │                                      │
       │   ┌─ Timeout (> 10s) ─────────────┐ │
       │   │  consecutive_failures++        │ │
       │   │  emit "acp:heartbeat" degraded │ │
       │   └────────────────────────────────┘ │
       │                                      │
       │   ┌─ 3 consecutive failures ──────┐  │
       │   │  emit "disconnected"          │  │
       │   │  heartbeat task exits         │  │
       │   └────────────────────────────────┘ │
```

---

## 10. Event Reference

| Event Name | Emitter | Payload | Listener |
|------------|---------|---------|----------|
| `acp:session-update` | `connection.rs` (reader) | `{ workspaceId, sessionId, updateType, payload }` | `session-cache.ts` (global) |
| `acp:user-message-saved` | `connection.rs` (send_prompt) | `{ sessionId, id, content }` | `useSessionMessages.ts` |
| `acp:connection-status` | `connection.rs` / `commands.rs` | `{ workspace_id, status, attempt? }` | `useAcpConnection.ts` |
| `acp:session-status` | `commands.rs` | `{ sessionId, status }` | `useSessionConnection.ts` |
| `acp:heartbeat` | `connection.rs` (heartbeat) | `{ workspace_id, status, latency_ms?, timestamp }` | (logged) |
| `acp:log` | `connection.rs` | `{ timestamp, level, event, message, workspace_id }` | `useAcpLogs.ts` |

---

## 11. File Map

| Layer | File | Responsibility |
|-------|------|----------------|
| **Rust** | `acp/connection.rs` | Child process I/O, JSON-RPC, streaming buffer, user msg persistence + event |
| **Rust** | `acp/commands.rs` | Tauri command handlers, per-session store, LRU eviction |
| **Rust** | `acp/types.rs` | JSON-RPC structs, ACP params/responses |
| **Rust** | `messages.rs` | SQLite CRUD for messages table |
| **TS** | `lib/session-cache.ts` | In-memory streaming state, chunk processing, timers, pub/sub |
| **TS** | `hooks/useSessionMessages.ts` | SQLite ↔ React state bridge, event listener, pagination |
| **TS** | `hooks/useSessionConnection.ts` | Per-session connect/disconnect lifecycle |
| **TS** | `hooks/usePlanWorkflow.ts` | Plan phase state machine, mode routing |
| **TSX** | `components/ActiveSessionView.tsx` | Session UI orchestrator, sendPrompt, panel layout |
| **TSX** | `components/TerminalMessage.tsx` | Message rendering (plain text vs markdown) |
| **TSX** | `components/TerminalChat.tsx` | Chat container, message list, input, scroll |
