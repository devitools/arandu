import type { AcpMessage, AcpSessionUpdate, AcpSessionMode, AcpSessionConfigOption } from "@/types/acp";
import type { AcpConnectionStatus } from "@/hooks/useAcpConnection";

interface ConnectionEntry {
  status: AcpConnectionStatus;
  error: string | null;
}

export interface SessionEntry {
  messages: AcpMessage[];
  activeAcpSessionId: string | null;
  currentMode: string | null;
  availableModes: AcpSessionMode[];
  availableConfigOptions: AcpSessionConfigOption[];
  selectedConfigOptions: Record<string, string>;
  agentPlanFilePath: string | null;
  isStreaming: boolean;
}

interface UiEntry {
  mountedSessionId: string | null;
}

const connections = new Map<string, ConnectionEntry>();
const sessions = new Map<string, SessionEntry>();
const ui = new Map<string, UiEntry>();

export const connectionStore = {
  get: (id: string) => connections.get(id),
  set: (id: string, entry: ConnectionEntry) => connections.set(id, entry),
  has: (id: string) => connections.has(id),
};

export const sessionStore = {
  get: (id: string) => sessions.get(id),
  set: (id: string, entry: SessionEntry) => sessions.set(id, entry),
};

export const uiStore = {
  get: (id: string) => ui.get(id),
  set: (id: string, entry: UiEntry) => ui.set(id, entry),
};

export function clearWorkspaceCaches(workspaceId: string) {
  connections.delete(workspaceId);
  sessions.delete(workspaceId);
  subscribers.delete(workspaceId);
  ui.delete(workspaceId);
  clearStreamingTimer(workspaceId);
  clearFormatTimer(workspaceId);
}

let msgCounter = 0;
function nextMsgId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

function processSessionUpdate(entry: SessionEntry, update: AcpSessionUpdate): SessionEntry {
  const { updateType, payload, workspaceId } = update;
  console.debug("[session-cache] %s: workspace=%s msgs=%d streaming=%s", updateType, workspaceId, entry.messages.length, entry.isStreaming);
  const p = payload as Record<string, unknown>;
  const msgs = [...entry.messages];
  let { isStreaming, agentPlanFilePath, currentMode } = entry;

  switch (updateType) {
    case "agent_message_chunk": {
      const content = p.content as Record<string, unknown> | undefined;
      const text = content?.type === "text" ? (content.text as string) : "";
      if (!text) break;
      if (/^(Warning:|Info:|🔬|Experimental)/.test(text)) {
        msgs.push({ id: nextMsgId(), role: "assistant", type: "notice", content: text, timestamp: new Date() });
      } else {
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant" && !last.type) {
          msgs[msgs.length - 1] = { ...last, content: last.content + text };
        } else {
          msgs.push({ id: nextMsgId(), role: "assistant", content: text, timestamp: new Date() });
        }
      }
      isStreaming = true;
      break;
    }
    case "agent_thought_chunk": {
      const content = p.content as Record<string, unknown> | undefined;
      const text = content?.type === "text" ? (content.text as string) : "";
      if (!text) break;
      const last = msgs[msgs.length - 1];
      if (last?.role === "assistant" && last.type === "thinking") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({ id: nextMsgId(), role: "assistant", type: "thinking", content: text, timestamp: new Date() });
      }
      isStreaming = true;
      break;
    }
    case "end_turn":
      isStreaming = false;
      msgs.splice(0); // clear live buffer — persisted messages live in SQLite
      break;
    case "tool_call": {
      msgs.push({
        id: nextMsgId(),
        role: "assistant",
        type: "tool",
        content: "",
        timestamp: new Date(),
        toolCallId: p.toolCallId as string,
        toolTitle: p.title as string,
        toolStatus: (p.status as string) || "pending",
      });
      const locations = p.locations as Array<{ path: string }> | undefined;
      const rawInput = p.rawInput as Record<string, unknown> | undefined;
      const filePath = locations?.[0]?.path || (rawInput?.path as string) || (rawInput?.file_path as string) || "";
      if (/\/plan[^/]*\.md$/i.test(filePath)) agentPlanFilePath = filePath;
      isStreaming = true;
      break;
    }
    case "tool_call_update": {
      if (p.status !== "completed") break;
      const rawOutput = p.rawOutput as Record<string, unknown> | undefined;
      const summary = rawOutput?.content as string;
      if (!summary) break;
      const idx = msgs.findIndex((m) => m.toolCallId === (p.toolCallId as string));
      if (idx !== -1) {
        msgs[idx] = { ...msgs[idx], content: summary, toolStatus: "completed" };
      }
      break;
    }
    case "current_mode_update":
      currentMode = p.currentModeId as string;
      break;
    case "session_modes":
    case "session_info_update": {
      const modeState = readModeState(p);
      if (modeState.availableModes) entry.availableModes = modeState.availableModes;
      if (modeState.currentMode) currentMode = modeState.currentMode;
      const configState = readConfigState(p);
      if (configState.availableConfigOptions) entry.availableConfigOptions = configState.availableConfigOptions;
      if (configState.selectedConfigOptions) entry.selectedConfigOptions = configState.selectedConfigOptions;
      break;
    }
    case "config_option_update":
    case "config_options_update": {
      const configState = readConfigState(p);
      if (configState.availableConfigOptions) entry.availableConfigOptions = configState.availableConfigOptions;
      if (configState.selectedConfigOptions) entry.selectedConfigOptions = configState.selectedConfigOptions;
      break;
    }
  }

  return { ...entry, messages: msgs.length === 0 ? [] : msgs, isStreaming, agentPlanFilePath, currentMode, availableModes: entry.availableModes, availableConfigOptions: entry.availableConfigOptions, selectedConfigOptions: entry.selectedConfigOptions };
}

type SessionSubscriber = (entry: SessionEntry) => void;
const subscribers = new Map<string, Set<SessionSubscriber>>();
const streamingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const formatTimers = new Map<string, ReturnType<typeof setTimeout>>();

const STREAMING_TIMEOUT_MS = 60_000;

/**
 * Idle time (ms) after the last chunk before auto-formatting markdown.
 * Adjust this value to control how quickly streaming text switches
 * from plain text to rendered markdown when no new chunks arrive.
 */
const FORMAT_IDLE_MS = 5_000;

function resetStreamingTimer(workspaceId: string) {
  const existing = streamingTimers.get(workspaceId);
  if (existing) clearTimeout(existing);

  streamingTimers.set(workspaceId, setTimeout(() => {
    streamingTimers.delete(workspaceId);
    const entry = sessions.get(workspaceId);
    if (entry?.isStreaming) {
      const updated = { ...entry, isStreaming: false };
      sessions.set(workspaceId, updated);
      notifySubscribers(workspaceId, updated);
    }
  }, STREAMING_TIMEOUT_MS));
}

function clearStreamingTimer(workspaceId: string) {
  const existing = streamingTimers.get(workspaceId);
  if (existing) {
    clearTimeout(existing);
    streamingTimers.delete(workspaceId);
  }
}

function resetFormatTimer(workspaceId: string) {
  clearFormatTimer(workspaceId);
  formatTimers.set(workspaceId, setTimeout(() => {
    formatTimers.delete(workspaceId);
    const entry = sessions.get(workspaceId);
    if (entry?.isStreaming) {
      const updated = { ...entry, isStreaming: false };
      sessions.set(workspaceId, updated);
      notifySubscribers(workspaceId, updated);
    }
  }, FORMAT_IDLE_MS));
}

function clearFormatTimer(workspaceId: string) {
  const existing = formatTimers.get(workspaceId);
  if (existing) {
    clearTimeout(existing);
    formatTimers.delete(workspaceId);
  }
}

function notifySubscribers(workspaceId: string, entry: SessionEntry) {
  const subs = subscribers.get(workspaceId);
  if (subs) {
    for (const cb of subs) cb(entry);
  }
}

let listenerSetup = false;
function ensureGlobalListener() {
  if (listenerSetup) return;
  listenerSetup = true; // set synchronously to prevent double-registration on concurrent calls

  window.__TAURI__.event.listen<AcpSessionUpdate>("acp:session-update", (event: { payload: AcpSessionUpdate }) => {
    const update = event.payload;
    const { workspaceId, sessionId } = update;
    const entry = sessions.get(workspaceId);
    if (!entry) return;
    if (entry.activeAcpSessionId && sessionId !== entry.activeAcpSessionId) return;

    const newEntry = processSessionUpdate(entry, update);
    sessions.set(workspaceId, newEntry);
    notifySubscribers(workspaceId, newEntry);

    if (newEntry.isStreaming) {
      resetStreamingTimer(workspaceId);
      resetFormatTimer(workspaceId);
    } else {
      clearStreamingTimer(workspaceId);
      clearFormatTimer(workspaceId);
    }
  }).catch((e: unknown) => {
    listenerSetup = false; // allow retry if registration fails
    console.error(e);
  });
}

export function subscribeSession(sessionId: string, cb: SessionSubscriber): () => void {
  ensureGlobalListener();
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      activeAcpSessionId: null,
      currentMode: null,
      availableModes: [],
      availableConfigOptions: [],
      selectedConfigOptions: {},
      agentPlanFilePath: null,
      isStreaming: false,
    });
  }
  let subs = subscribers.get(sessionId);
  if (!subs) {
    subs = new Set();
    subscribers.set(sessionId, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
    if (subs!.size === 0) subscribers.delete(sessionId);
  };
}

export function updateSessionEntry(sessionId: string, partial: Partial<SessionEntry>) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  const newEntry = { ...entry, ...partial };
  sessions.set(sessionId, newEntry);
  notifySubscribers(sessionId, newEntry);
}

export function resetSessionMessages(sessionId: string) {
  const entry = sessions.get(sessionId);
  if (entry && entry.messages.length > 0) {
    const cleared = { ...entry, messages: [] as AcpMessage[] };
    sessions.set(sessionId, cleared);
    notifySubscribers(sessionId, cleared);
  }
}

export function addUserMessage(sessionId: string, text: string) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  const newEntry = {
    ...entry,
    messages: [...entry.messages, { id: nextMsgId(), role: "user" as const, content: text, timestamp: new Date() }],
    isStreaming: true,
  };
  sessions.set(sessionId, newEntry);
  notifySubscribers(sessionId, newEntry);
  resetStreamingTimer(sessionId);
}

export function addSystemNotice(sessionId: string, text: string) {
  const entry = sessions.get(sessionId);
  if (!entry || !text.trim()) return;
  const newEntry = {
    ...entry,
    messages: [
      ...entry.messages,
      { id: nextMsgId(), role: "assistant" as const, type: "notice" as const, content: text, timestamp: new Date() },
    ],
  };
  sessions.set(sessionId, newEntry);
  notifySubscribers(sessionId, newEntry);
}

function normalizeSelectedConfigOptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = typeof v === "string" ? v : String(v ?? "");
  }
  return result;
}

function readConfigState(p: Record<string, unknown>): { availableConfigOptions?: AcpSessionConfigOption[]; selectedConfigOptions?: Record<string, string> } {
  const result: { availableConfigOptions?: AcpSessionConfigOption[]; selectedConfigOptions?: Record<string, string> } = {};
  if (Array.isArray(p.availableConfigOptions)) {
    result.availableConfigOptions = p.availableConfigOptions as AcpSessionConfigOption[];
  }
  if (p.selectedConfigOptions && typeof p.selectedConfigOptions === "object") {
    result.selectedConfigOptions = normalizeSelectedConfigOptions(p.selectedConfigOptions);
  }
  return result;
}

function readModeState(p: Record<string, unknown>): { availableModes?: AcpSessionMode[]; currentMode?: string } {
  const result: { availableModes?: AcpSessionMode[]; currentMode?: string } = {};
  if (Array.isArray(p.availableModes)) {
    result.availableModes = (p.availableModes as unknown[]).map((m) => {
      if (typeof m === "string") return { id: m } as AcpSessionMode;
      return m as AcpSessionMode;
    });
  }
  if (typeof p.currentModeId === "string") {
    result.currentMode = p.currentModeId;
  }
  return result;
}
