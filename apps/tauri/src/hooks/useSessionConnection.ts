import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export type SessionConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected";

interface UseSessionConnectionReturn {
  status: SessionConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;
  connect: (workspacePath: string, binary?: string, ghToken?: string, acpSessionId?: string) => Promise<string | null>;
  disconnect: () => Promise<void>;
}

export function useSessionConnection(sessionId: string): UseSessionConnectionReturn {
  const [status, setStatus] = useState<SessionConnectionStatus>("idle");

  // Check live status on mount
  useEffect(() => {
    if (!sessionId) return;
    invoke<string>("acp_session_status", { sessionId })
      .then((s) => setStatus(s === "connected" ? "connected" : "disconnected"))
      .catch(() => setStatus("disconnected"));
  }, [sessionId]);

  // Listen to per-session status events emitted by backend
  useEffect(() => {
    if (!sessionId) return;
    let unlisten: (() => void) | null = null;

    window.__TAURI__.event
      .listen<{ sessionId: string; status: string }>("acp:session-status", (event) => {
        if (event.payload.sessionId !== sessionId) return;
        const s = event.payload.status;
        if (s === "connected") setStatus("connected");
        else if (s === "connecting") setStatus("connecting");
        else if (s === "disconnected") setStatus("disconnected");
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [sessionId]);

  const connect = useCallback(
    async (workspacePath: string, binary?: string, ghToken?: string, acpSessionId?: string) => {
      setStatus("connecting");
      try {
        const copilotSessionId = await invoke<string>("acp_session_connect", {
          sessionId,
          workspacePath,
          binaryPath: binary ?? null,
          ghToken: ghToken ?? null,
          acpSessionId: acpSessionId ?? null,
        });
        setStatus("connected");
        return copilotSessionId;
      } catch (e) {
        console.error("[useSessionConnection] connect error:", e);
        setStatus("disconnected");
        return null;
      }
    },
    [sessionId]
  );

  const disconnect = useCallback(async () => {
    try {
      await invoke("acp_session_disconnect", { sessionId });
    } catch (e) {
      console.error("[useSessionConnection] disconnect error:", e);
    } finally {
      setStatus("disconnected");
    }
  }, [sessionId]);

  return {
    status,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    connect,
    disconnect,
  };
}
