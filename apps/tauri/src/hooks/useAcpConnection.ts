import { useState, useCallback, useRef, useEffect } from "react";
import type { AcpConnectionStatusEvent } from "@/types/acp";

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
  const [connectionStatus, setConnectionStatus] =
    useState<AcpConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectedRef = useRef(false);

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  // Listen to Rust-side connection status events
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    window.__TAURI__.event.listen<AcpConnectionStatusEvent>("acp:connection-status", (event: { payload: AcpConnectionStatusEvent }) => {
      if (cancelled) return;
      if (event.payload.workspaceId !== workspaceId) return;

      const { status } = event.payload;
      setConnectionStatus(status);
      if (status === "connected") {
        connectedRef.current = true;
        setConnectionError(null);
      } else if (status === "disconnected") {
        connectedRef.current = false;
      }
    }).then((fn: () => void) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [workspaceId]);

  // Check health when the window regains visibility (e.g., unminimize)
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && connectedRef.current) {
        window.__TAURI__.core.invoke("acp_check_health", { workspaceId }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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
      // Status will be updated via acp:connection-status event from Rust
    } catch (e) {
      setConnectionError(String(e));
      setConnectionStatus("disconnected");
    }
  }, [workspaceId, workspacePath, connectionStatus]);

  const disconnect = useCallback(async () => {
    if (!connectedRef.current) return;
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
      if (connectedRef.current) {
        window.__TAURI__.core.invoke("acp_disconnect", { workspaceId }).catch(() => {});
        connectedRef.current = false;
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
