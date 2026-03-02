import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AcpSessionInfo,
  AcpSessionUpdate,
  AcpMessage,
} from "@/types/acp";

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

let msgCounter = 0;
function nextMsgId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

function extractModes(
  info: AcpSessionInfo,
  setAvailableModes: (m: string[]) => void,
  setCurrentMode: (m: string) => void
) {
  if (info.modes) {
    setAvailableModes(info.modes.availableModes.map((m) => m.id));
    if (info.modes.currentModeId) setCurrentMode(info.modes.currentModeId);
  }
}

export function useAcpSession(
  workspaceId: string,
  workspacePath: string,
  isConnected: boolean
): UseAcpSessionReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [messages, setMessages] = useState<AcpMessage[]>([]);
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [availableModes, setAvailableModes] = useState<string[]>([]);
  const [activeAcpSessionId, setActiveAcpSessionId] = useState<string | null>(null);
  const [agentPlanFilePath, setAgentPlanFilePath] = useState<string | null>(null);
  const activeAcpSessionIdRef = useRef<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;

    listen<AcpSessionUpdate>("acp:session-update", (event) => {
      if (cancelled) return;
      const update = event.payload;
      if (update.workspaceId !== workspaceIdRef.current) return;
      const currentAcpId = activeAcpSessionIdRef.current;
      if (
        currentAcpId &&
        update.sessionId !== currentAcpId
      ) {
        return;
      }
      handleSessionUpdate(update);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsStreaming(false);
    }, 800);
  }, []);

  const handleSessionUpdate = useCallback((update: AcpSessionUpdate) => {
    const { updateType, payload } = update;
    const p = payload as Record<string, unknown>;

    switch (updateType) {
      case "agent_message_chunk": {
        const content = p.content as Record<string, unknown> | undefined;
        const text = content?.type === "text" ? (content.text as string) : "";
        if (!text) break;

        if (/^(Warning:|Info:|🔬|Experimental)/.test(text)) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextMsgId(),
              role: "assistant",
              type: "notice",
              content: text,
              timestamp: new Date(),
            },
          ]);
        } else {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.type) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + text },
              ];
            }
            return [
              ...prev,
              {
                id: nextMsgId(),
                role: "assistant",
                content: text,
                timestamp: new Date(),
              },
            ];
          });
        }
        setIsStreaming(true);
        resetIdleTimer();
        break;
      }

      case "agent_thought_chunk": {
        const content = p.content as Record<string, unknown> | undefined;
        const text = content?.type === "text" ? (content.text as string) : "";
        if (!text) break;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.type === "thinking") {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + text },
            ];
          }
          return [
            ...prev,
            {
              id: nextMsgId(),
              role: "assistant",
              type: "thinking",
              content: text,
              timestamp: new Date(),
            },
          ];
        });
        setIsStreaming(true);
        resetIdleTimer();
        break;
      }

      case "end_turn":
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setIsStreaming(false);
        break;

      case "tool_call": {
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            role: "assistant",
            type: "tool",
            content: (p.title as string) || (p.kind as string) || "Tool call",
            timestamp: new Date(),
            toolCallId: p.toolCallId as string,
            toolTitle: p.title as string,
            toolStatus: (p.status as string) || "pending",
          },
        ]);

        const locations = p.locations as Array<{ path: string }> | undefined;
        const rawInput = p.rawInput as Record<string, unknown> | undefined;
        const filePath =
          locations?.[0]?.path ||
          (rawInput?.path as string) ||
          (rawInput?.file_path as string) ||
          "";
        if (filePath.endsWith("/plan.md")) {
          setAgentPlanFilePath(filePath);
        }

        setIsStreaming(true);
        resetIdleTimer();
        break;
      }

      case "tool_call_update": {
        if (p.status !== "completed") break;
        const rawOutput = p.rawOutput as Record<string, unknown> | undefined;
        const summary = rawOutput?.content as string;
        if (!summary) break;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.toolCallId === (p.toolCallId as string)
              ? {
                  ...msg,
                  content: `${msg.toolTitle || "Tool"}: ${summary}`,
                  toolStatus: "completed",
                }
              : msg
          )
        );
        break;
      }

      case "user_message_chunk": {
        const content = p.content;
        let text = "";
        if (Array.isArray(content)) {
          text = content
            .filter(
              (c: Record<string, unknown>) => c?.type === "text"
            )
            .map((c: Record<string, unknown>) => (c.text as string) ?? "")
            .join("");
        } else if (
          typeof content === "object" &&
          content !== null &&
          (content as Record<string, unknown>).type === "text"
        ) {
          text = (content as Record<string, unknown>).text as string;
        }
        if (!text) break;

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user") {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + text },
            ];
          }
          return [
            ...prev,
            {
              id: nextMsgId(),
              role: "user",
              content: text,
              timestamp: new Date(),
            },
          ];
        });
        break;
      }

      case "current_mode_update":
        setCurrentMode(p.currentModeId as string);
        break;
    }
  }, []);

  const startSession = useCallback(
    async (existingAcpSessionId?: string): Promise<string> => {
      if (!isConnected) throw new Error("Not connected to ACP");

      setErrors([]);
      setMessages([]);

      let acpId: string;
      if (existingAcpSessionId) {
        try {
          // Fresh load — ACP will replay history via events
          const info = await invoke<AcpSessionInfo>("acp_load_session", {
            workspaceId,
            sessionId: existingAcpSessionId,
            cwd: workspacePath,
          });
          acpId = info.sessionId;
          extractModes(info, setAvailableModes, setCurrentMode);
        } catch (e) {
          if (String(e).includes("already loaded")) {
            acpId = existingAcpSessionId;
          } else {
            throw e;
          }
        }
      } else {
        const info = await invoke<AcpSessionInfo>("acp_new_session", {
          workspaceId,
          cwd: workspacePath,
        });
        acpId = info.sessionId;
        extractModes(info, setAvailableModes, setCurrentMode);
      }

      activeAcpSessionIdRef.current = acpId;
      setActiveAcpSessionId(acpId);
      return acpId;
    },
    [isConnected, workspaceId, workspacePath]
  );

  const sendPrompt = useCallback(
    async (text: string) => {
      const sid = activeAcpSessionIdRef.current;
      if (!sid) return;

      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId(),
          role: "user",
          content: text,
          timestamp: new Date(),
        },
      ]);
      setIsStreaming(true);

      try {
        await invoke("acp_send_prompt", {
          workspaceId,
          sessionId: sid,
          text,
        });
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
        setIsStreaming(false);
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
        setCurrentMode(mode);
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
      setIsStreaming(false);
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [workspaceId]);

  const clearErrors = useCallback(() => setErrors([]), []);
  const clearMessages = useCallback(() => setMessages([]), []);

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
