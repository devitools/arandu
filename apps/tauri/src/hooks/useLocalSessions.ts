import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionRecord } from "@/types";

interface UseLocalSessionsReturn {
  sessions: SessionRecord[];
  loading: boolean;
  createSession: (name: string, prompt: string) => Promise<SessionRecord>;
  updateSessionLocal: (id: string, updates: Partial<SessionRecord>) => void;
  deleteSession: (id: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

export function useLocalSessions(workspacePath: string): UseLocalSessionsReturn {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSessions = useCallback(async () => {
    try {
      const result = await invoke<SessionRecord[]>("session_list", {
        workspacePath,
      });
      setSessions(result);
    } catch (err) {
      console.error("[sessions] Failed to list sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    setLoading(true);
    refreshSessions();
  }, [refreshSessions]);

  const createSession = useCallback(
    async (name: string, prompt: string): Promise<SessionRecord> => {
      const record = await invoke<SessionRecord>("session_create", {
        workspacePath,
        name,
        initialPrompt: prompt,
      });
      setSessions((prev) => [record, ...prev]);
      return record;
    },
    [workspacePath]
  );

  const updateSessionLocal = useCallback(
    (id: string, updates: Partial<SessionRecord>) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await invoke("session_delete", { id });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    },
    []
  );

  return {
    sessions,
    loading,
    createSession,
    updateSessionLocal,
    deleteSession,
    refreshSessions,
  };
}
