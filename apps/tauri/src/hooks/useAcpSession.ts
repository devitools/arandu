import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AcpSessionInfo,
  AcpMessage,
} from "@/types/acp";
import {
  sessionStore,
  subscribeSession,
  updateSessionEntry,
  addUserMessage,
  type SessionEntry,
} from "@/lib/session-cache";

interface UseAcpSessionReturn {
  isStreaming: boolean;
  errors: string[];
  messages: AcpMessage[];
  currentMode: string | null;
  availableModes: string[];
  activeAcpSessionId: string | null;
  agentPlanFilePath: string | null;
  startSession: (acpSessionId?: string) => Promise<string>;
  sendPrompt: (text: string) => Promise<void>;
  setMode: (mode: string) => Promise<void>;
  cancel: () => Promise<void>;
  clearErrors: () => void;
  clearMessages: () => void;
}

function extractModes(
  info: AcpSessionInfo,
  cb: (modes: string[], current: string | null) => void
) {
  if (info.modes) {
    cb(
      info.modes.availableModes.map((m) => m.id),
      info.modes.currentModeId ?? null
    );
  }
}

const EMPTY_SESSION: SessionEntry = {
  messages: [],
  activeAcpSessionId: null,
  currentMode: null,
  availableModes: [],
  agentPlanFilePath: null,
  isStreaming: false,
};

export function useAcpSession(
  workspaceId: string,
  workspacePath: string,
  isConnected: boolean
): UseAcpSessionReturn {
  const cached = sessionStore.get(workspaceId);

  const [messages, setMessages] = useState<AcpMessage[]>(cached?.messages ?? []);
  const [isStreaming, setIsStreaming] = useState(cached?.isStreaming ?? false);
  const [currentMode, setCurrentMode] = useState<string | null>(cached?.currentMode ?? null);
  const [availableModes, setAvailableModes] = useState<string[]>(cached?.availableModes ?? []);
  const [activeAcpSessionId, setActiveAcpSessionId] = useState<string | null>(cached?.activeAcpSessionId ?? null);
  const [agentPlanFilePath, setAgentPlanFilePath] = useState<string | null>(cached?.agentPlanFilePath ?? null);
  const [errors, setErrors] = useState<string[]>([]);

  const activeAcpSessionIdRef = useRef<string | null>(cached?.activeAcpSessionId ?? null);
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const entry = sessionStore.get(workspaceId);
    if (entry) {
      setMessages(entry.messages);
      setIsStreaming(entry.isStreaming);
      setCurrentMode(entry.currentMode);
      setAvailableModes(entry.availableModes);
      setActiveAcpSessionId(entry.activeAcpSessionId);
      setAgentPlanFilePath(entry.agentPlanFilePath);
      activeAcpSessionIdRef.current = entry.activeAcpSessionId;
    }

    const unsubscribe = subscribeSession(workspaceId, (e) => {
      setMessages(e.messages);
      setCurrentMode(e.currentMode);
      setAvailableModes(e.availableModes);
      setActiveAcpSessionId(e.activeAcpSessionId);
      setAgentPlanFilePath(e.agentPlanFilePath);
      activeAcpSessionIdRef.current = e.activeAcpSessionId;

      if (e.isStreaming) {
        setIsStreaming(true);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setIsStreaming(false), 800);
      } else {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setIsStreaming(false);
      }
    });

    return unsubscribe;
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const startSession = useCallback(
    async (existingAcpSessionId?: string): Promise<string> => {
      if (!isConnected) throw new Error("Not connected to ACP");

      setErrors([]);

      let acpId: string;
      if (existingAcpSessionId) {
        const previousEntry = sessionStore.get(workspaceId);

        const fresh: SessionEntry = {
          ...EMPTY_SESSION,
          activeAcpSessionId: existingAcpSessionId,
        };
        sessionStore.set(workspaceId, fresh);
        setMessages([]);
        setIsStreaming(false);

        try {
          const info = await invoke<AcpSessionInfo>("acp_load_session", {
            workspaceId,
            sessionId: existingAcpSessionId,
            cwd: workspacePath,
          });
          acpId = info.sessionId;
          extractModes(info, (modes, current) => {
            updateSessionEntry(workspaceId, { availableModes: modes, currentMode: current });
          });
        } catch (e) {
          if (String(e).includes("already loaded")) {
            acpId = existingAcpSessionId;
            if (previousEntry && previousEntry.messages.length > 0) {
              updateSessionEntry(workspaceId, { messages: previousEntry.messages });
            }
          } else {
            throw e;
          }
        }
      } else {
        const fresh: SessionEntry = { ...EMPTY_SESSION };
        sessionStore.set(workspaceId, fresh);
        setMessages([]);
        setIsStreaming(false);

        const info = await invoke<AcpSessionInfo>("acp_new_session", {
          workspaceId,
          cwd: workspacePath,
        });
        acpId = info.sessionId;
        extractModes(info, (modes, current) => {
          updateSessionEntry(workspaceId, { availableModes: modes, currentMode: current });
        });
      }

      activeAcpSessionIdRef.current = acpId;
      updateSessionEntry(workspaceId, { activeAcpSessionId: acpId });
      return acpId;
    },
    [isConnected, workspaceId, workspacePath]
  );

  const sendPrompt = useCallback(
    async (text: string) => {
      const sid = activeAcpSessionIdRef.current;
      if (!sid) return;

      addUserMessage(workspaceId, text);

      try {
        await invoke("acp_send_prompt", {
          workspaceId,
          sessionId: sid,
          text,
        });
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
        updateSessionEntry(workspaceId, { isStreaming: false });
      }
    },
    [workspaceId]
  );

  const setMode = useCallback(
    async (mode: string) => {
      const sid = activeAcpSessionIdRef.current;
      if (!sid) return;
      try {
        await invoke("acp_set_mode", {
          workspaceId,
          sessionId: sid,
          mode,
        });
        updateSessionEntry(workspaceId, { currentMode: mode });
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
      }
    },
    [workspaceId]
  );

  const cancel = useCallback(async () => {
    const sid = activeAcpSessionIdRef.current;
    if (!sid) return;
    try {
      await invoke("acp_cancel", {
        workspaceId,
        sessionId: sid,
      });
      updateSessionEntry(workspaceId, { isStreaming: false });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [workspaceId]);

  const clearErrors = useCallback(() => setErrors([]), []);
  const clearMessages = useCallback(() => {
    updateSessionEntry(workspaceId, { messages: [] });
  }, [workspaceId]);

  return {
    isStreaming,
    errors,
    messages,
    currentMode,
    availableModes,
    activeAcpSessionId,
    agentPlanFilePath,
    startSession,
    sendPrompt,
    setMode,
    cancel,
    clearErrors,
    clearMessages,
  };
}
