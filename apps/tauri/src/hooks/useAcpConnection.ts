import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseAcpConnectionReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useAcpConnection(
  workspaceId: string,
  workspacePath: string
): UseAcpConnectionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectedRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectedRef.current || isConnecting) return;
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const binaryPath = localStorage.getItem("arandu-copilot-path") || undefined;
      const ghToken = localStorage.getItem("arandu-gh-token") || undefined;
      await invoke("acp_connect", {
        workspaceId,
        cwd: workspacePath,
        binaryPath,
        ghToken,
      });
      connectedRef.current = true;
      setIsConnected(true);
    } catch (e) {
      setConnectionError(String(e));
    } finally {
      setIsConnecting(false);
    }
  }, [workspaceId, workspacePath, isConnecting]);

  const disconnect = useCallback(async () => {
    if (!connectedRef.current) return;
    try {
      await invoke("acp_disconnect", { workspaceId });
    } catch {
      // ignore disconnect errors
    } finally {
      connectedRef.current = false;
      setIsConnected(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (connectedRef.current) {
        invoke("acp_disconnect", { workspaceId }).catch(() => {});
        connectedRef.current = false;
      }
    };
  }, [workspaceId]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    disconnect,
  };
}
