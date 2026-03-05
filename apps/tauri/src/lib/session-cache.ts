import type { AcpMessage, AcpSessionUpdate } from "@/types/acp";
import type { AcpConnectionStatus } from "@/hooks/useAcpConnection";

interface ConnectionEntry {
  status: AcpConnectionStatus;
  error: string | null;
}

export interface SessionEntry {
  messages: AcpMessage[];
  activeAcpSessionId: string | null;
  currentMode: string | null;
  availableModes: string[];
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
}

let msgCounter = 0;
function nextMsgId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

function processSessionUpdate(entry: SessionEntry, update: AcpSessionUpdate): SessionEntry {
  const { updateType, payload } = update;
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
      break;
    case "tool_call": {
      msgs.push({
        id: nextMsgId(),
        role: "assistant",
        type: "tool",
        content: (p.title as string) || (p.kind as string) || "Tool call",
        timestamp: new Date(),
        toolCallId: p.toolCallId as string,
        toolTitle: p.title as string,
        toolStatus: (p.status as string) || "pending",
      });
      const locations = p.locations as Array<{ path: string }> | undefined;
      const rawInput = p.rawInput as Record<string, unknown> | undefined;
      const filePath = locations?.[0]?.path || (rawInput?.path as string) || (rawInput?.file_path as string) || "";
      if (filePath.endsWith("/plan.md")) agentPlanFilePath = filePath;
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
        msgs[idx] = { ...msgs[idx], content: `${msgs[idx].toolTitle || "Tool"}: ${summary}`, toolStatus: "completed" };
      }
      break;
    }
    case "user_message_chunk": {
      const content = p.content;
      let text = "";
      if (Array.isArray(content)) {
        text = content.filter((c: Record<string, unknown>) => c?.type === "text").map((c: Record<string, unknown>) => (c.text as string) ?? "").join("");
      } else if (typeof content === "object" && content !== null && (content as Record<string, unknown>).type === "text") {
        text = (content as Record<string, unknown>).text as string;
      }
      if (!text) break;
      const last = msgs[msgs.length - 1];
      if (last?.role === "user") {
        msgs[msgs.length - 1] = { ...last, content: last.content + text };
      } else {
        msgs.push({ id: nextMsgId(), role: "user", content: text, timestamp: new Date() });
      }
      break;
    }
    case "current_mode_update":
      currentMode = p.currentModeId as string;
      break;
  }

  return { ...entry, messages: msgs, isStreaming, agentPlanFilePath, currentMode };
}

type SessionSubscriber = (entry: SessionEntry) => void;
const subscribers = new Map<string, Set<SessionSubscriber>>();

function notifySubscribers(workspaceId: string, entry: SessionEntry) {
  const subs = subscribers.get(workspaceId);
  if (subs) {
    for (const cb of subs) cb(entry);
  }
}

let listenerSetup = false;
function ensureGlobalListener() {
  if (listenerSetup) return;
  listenerSetup = true;

  window.__TAURI__.event.listen<AcpSessionUpdate>("acp:session-update", (event: { payload: AcpSessionUpdate }) => {
    const update = event.payload;
    const { workspaceId, sessionId } = update;
    const entry = sessions.get(workspaceId);
    if (!entry) return;
    if (entry.activeAcpSessionId && sessionId !== entry.activeAcpSessionId) return;

    const newEntry = processSessionUpdate(entry, update);
    sessions.set(workspaceId, newEntry);
    notifySubscribers(workspaceId, newEntry);
  }).catch(console.error);
}

export function subscribeSession(workspaceId: string, cb: SessionSubscriber): () => void {
  ensureGlobalListener();
  let subs = subscribers.get(workspaceId);
  if (!subs) {
    subs = new Set();
    subscribers.set(workspaceId, subs);
  }
  subs.add(cb);
  return () => {
    subs!.delete(cb);
    if (subs!.size === 0) subscribers.delete(workspaceId);
  };
}

export function updateSessionEntry(workspaceId: string, partial: Partial<SessionEntry>) {
  const entry = sessions.get(workspaceId);
  if (!entry) return;
  const newEntry = { ...entry, ...partial };
  sessions.set(workspaceId, newEntry);
  notifySubscribers(workspaceId, newEntry);
}

export function addUserMessage(workspaceId: string, text: string) {
  const entry = sessions.get(workspaceId);
  if (!entry) return;
  const newEntry = {
    ...entry,
    messages: [...entry.messages, { id: nextMsgId(), role: "user" as const, content: text, timestamp: new Date() }],
    isStreaming: true,
  };
  sessions.set(workspaceId, newEntry);
  notifySubscribers(workspaceId, newEntry);
}
