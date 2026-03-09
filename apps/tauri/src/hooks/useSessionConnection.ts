import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const HEALTH_CHECK_INTERVAL_MS = 30_000;

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
  const statusRef = useRef(status);
  statusRef.current = status;

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
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    window.__TAURI__.event
      .listen<{ sessionId: string; status: string }>("acp:session-status", (event) => {
        if (cancelled) return;
        if (event.payload.sessionId !== sessionId) return;
        const s = event.payload.status;
        if (s === "connected") setStatus("connected");
        else if (s === "connecting") setStatus("connecting");
        else if (s === "disconnected") setStatus("disconnected");
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [sessionId]);

  // Listen to acp:connection-status events (bridged from heartbeat)
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    window.__TAURI__.event
      .listen<{ workspaceId: string; status: string }>("acp:connection-status", (event) => {
        if (cancelled) return;
        if (event.payload.workspaceId !== sessionId) return;
        const s = event.payload.status;
        if (s === "connected") setStatus("connected");
        else if (s === "disconnected") setStatus("disconnected");
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [sessionId]);

  // Periodic health check (every 30s when connected)
  useEffect(() => {
    if (!sessionId) return;

    const check = () => {
      if (statusRef.current !== "connected") return;
      invoke<string>("acp_session_check_health", { sessionId }).catch(() => {
        setStatus("disconnected");
      });
    };

    const interval = setInterval(check, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Re-check on visibility change (tab regains focus)
  useEffect(() => {
    if (!sessionId) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && statusRef.current === "connected") {
        invoke<string>("acp_session_check_health", { sessionId }).catch(() => {
          setStatus("disconnected");
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
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
