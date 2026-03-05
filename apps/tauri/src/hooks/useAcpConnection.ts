import { useState, useCallback, useRef, useEffect } from "react";
import type { AcpConnectionStatusEvent } from "@/types/acp";
import { connectionStore } from "@/lib/session-cache";

export type AcpConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

interface UseAcpConnectionReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  connectionStatus: AcpConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useAcpConnection(
  workspaceId: string,
  workspacePath: string
): UseAcpConnectionReturn {
  const cached = connectionStore.get(workspaceId);
  const [connectionStatus, setConnectionStatus] =
    useState<AcpConnectionStatus>(cached?.status ?? "idle");
  const [connectionError, setConnectionError] = useState<string | null>(cached?.error ?? null);
  const connectedRef = useRef(cached?.status === "connected");

  const statusRef = useRef(connectionStatus);
  statusRef.current = connectionStatus;
  const errorRef = useRef(connectionError);
  errorRef.current = connectionError;

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  // Listen to Rust-side connection status events
  useEffect(() => {
    if (!connectionStore.has(workspaceId)) {
      connectedRef.current = false;
      setConnectionStatus("idle");
      setConnectionError(null);
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    window.__TAURI__.event.listen<AcpConnectionStatusEvent>("acp:connection-status", (event: { payload: AcpConnectionStatusEvent }) => {
      if (cancelled) return;
      if (event.payload.workspaceId !== workspaceId) return;

      const { status } = event.payload;
      setConnectionStatus(status);
      connectedRef.current = status === "connected";
      if (status === "connected") {
        setConnectionError(null);
      }
    }).then((fn: () => void) => {
      if (cancelled) fn();
      else unlisten = fn;
    }).catch((e: unknown) => {
      if (!cancelled) {
        setConnectionError(String(e));
        setConnectionStatus("disconnected");
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [workspaceId]);

  // Periodic heartbeat + visibility check
  useEffect(() => {
    const checkHealth = () => {
      if (!connectedRef.current) return;
      window.__TAURI__.core.invoke("acp_check_health", { workspaceId }).catch(() => {});
    };

    const onVisible = () => {
      if (!document.hidden) checkHealth();
    };
    document.addEventListener("visibilitychange", onVisible);

    const interval = setInterval(checkHealth, 30_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [workspaceId]);

  // Verify cached connection status on mount
  useEffect(() => {
    if (!connectionStore.has(workspaceId)) return;
    window.__TAURI__.core.invoke<string>("acp_check_health", { workspaceId })
      .then((status) => {
        const s = status as AcpConnectionStatus;
        connectedRef.current = s === "connected";
        setConnectionStatus(s);
        if (s === "connected") setConnectionError(null);
      })
      .catch(() => {
        connectedRef.current = false;
        setConnectionStatus("disconnected");
      });
  }, [workspaceId]);

  const connect = useCallback(async () => {
    if (
      connectedRef.current ||
      connectionStatus === "connecting" ||
      connectionStatus === "reconnecting"
    ) return;
    setConnectionStatus("connecting");
    setConnectionError(null);
    try {
      const binaryPath = localStorage.getItem("arandu-copilot-path") || undefined;
      const ghToken = localStorage.getItem("arandu-gh-token") || undefined;
      await window.__TAURI__.core.invoke("acp_connect", {
        workspaceId,
        cwd: workspacePath,
        binaryPath,
        ghToken,
      });
      // Fallback sync in case initial status event was emitted before listener attached
      try {
        const health = await window.__TAURI__.core.invoke<string>(
          "acp_check_health",
          { workspaceId }
        );
        connectedRef.current = health === "connected";
        setConnectionStatus(health as AcpConnectionStatus);
      } catch {
        // ignore; event stream remains source of truth
      }
    } catch (e) {
      setConnectionError(String(e));
      setConnectionStatus("disconnected");
    }
  }, [workspaceId, workspacePath, connectionStatus]);

  const disconnect = useCallback(async () => {
    try {
      await window.__TAURI__.core.invoke("acp_disconnect", { workspaceId });
    } catch {
      // ignore disconnect errors
    } finally {
      connectedRef.current = false;
      setConnectionStatus("idle");
    }
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (workspaceId) {
        connectionStore.set(workspaceId, {
          status: statusRef.current,
          error: errorRef.current,
        });
      }
    };
  }, [workspaceId]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    connectionStatus,
    connect,
    disconnect,
  };
}
