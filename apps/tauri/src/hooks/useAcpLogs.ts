import { useState, useEffect, useCallback } from "react";
import type { AcpConnectionLogEntry } from "@/types/acp";

const MAX_LOGS = 200;

interface UseAcpLogsReturn {
  logs: AcpConnectionLogEntry[];
  clearLogs: () => void;
  hasRecentErrors: boolean;
}

export function useAcpLogs(workspaceId: string): UseAcpLogsReturn {
  const [logs, setLogs] = useState<AcpConnectionLogEntry[]>([]);

  useEffect(() => {
    setLogs([]);
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    window.__TAURI__.event
      .listen<AcpConnectionLogEntry>("acp:log", (event: { payload: AcpConnectionLogEntry }) => {
        if (cancelled) return;
        if (event.payload.workspaceId !== workspaceId) return;
        setLogs((prev) => {
          const next = [...prev, event.payload];
          return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
        });
      })
      .then((fn: () => void) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [workspaceId]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const hasRecentErrors = logs.some((l) => l.level === "error");

  return { logs, clearLogs, hasRecentErrors };
}
