import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AcpMessage } from "@/types/acp";
import { subscribeSession } from "@/lib/session-cache";

const PAGE_SIZE = 50;

interface MessageRecord {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  message_type: string | null;
  tool_call_id: string | null;
  tool_title: string | null;
  tool_status: string | null;
  created_at: number;
}

function toAcpMessage(r: MessageRecord): AcpMessage {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    type: (r.message_type as AcpMessage["type"]) ?? undefined,
    toolCallId: r.tool_call_id ?? undefined,
    toolTitle: r.tool_title ?? undefined,
    toolStatus: r.tool_status ?? undefined,
    timestamp: new Date(r.created_at * 1000),
  };
}

export interface UseSessionMessagesReturn {
  clearMessages: () => void;
  messages: AcpMessage[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  addOptimisticMessage: (text: string) => void;
}

export function useSessionMessages(sessionId: string): UseSessionMessagesReturn {
  // dbMessages: persisted messages loaded from SQLite (includes optimistic entries)
  const [dbMessages, setDbMessages] = useState<AcpMessage[]>([]);
  // liveMessages: current in-progress streaming buffer (cleared on end_turn)
  const [liveMessages, setLiveMessages] = useState<AcpMessage[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const loadInitial = useCallback(async () => {
    setIsLoadingInitial(true);
    try {
      const records = await invoke<MessageRecord[]>("messages_list", {
        sessionId,
        offset: 0,
        limit: PAGE_SIZE,
      });
      offsetRef.current = records.length;
      setHasMore(records.length === PAGE_SIZE);
      setDbMessages(records.map(toAcpMessage));
      setLiveMessages([]);
    } catch (e) {
      console.error("[useSessionMessages] load error:", e);
    } finally {
      setIsLoadingInitial(false);
    }
  }, [sessionId]);

  useEffect(() => {
    offsetRef.current = 0;
    setHasMore(true);
    void loadInitial();
  }, [loadInitial]);

  // Subscribe to live streaming chunks from session-cache events
  useEffect(() => {
    const unsub = subscribeSession(sessionId, (entry) => {
      setLiveMessages(entry.messages);
      // When streaming ends and buffer is cleared, reload from DB
      if (!entry.isStreaming && entry.messages.length === 0) {
        setTimeout(() => void loadInitial(), 250);
      }
    });
    return unsub;
  }, [sessionId, loadInitial]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const records = await invoke<MessageRecord[]>("messages_list", {
        sessionId,
        offset: offsetRef.current,
        limit: PAGE_SIZE,
      });
      offsetRef.current += records.length;
      setHasMore(records.length === PAGE_SIZE);
      setDbMessages((prev) => [...records.map(toAcpMessage), ...prev]);
    } catch (e) {
      console.error("[useSessionMessages] loadMore error:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [sessionId, isLoadingMore, hasMore]);

  // Optimistically add a user message before DB confirmation
  const addOptimisticMessage = useCallback((text: string) => {
    const msg: AcpMessage = {
      id: `opt-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setDbMessages((prev) => [...prev, msg]);
  }, []);

  const clearMessages = useCallback(() => {
    setDbMessages([]);
    setLiveMessages([]);
  }, []);

  const messages = useMemo(() => [...dbMessages, ...liveMessages], [dbMessages, liveMessages]);

  return { messages, isLoadingInitial, isLoadingMore, hasMore, loadMore, addOptimisticMessage, clearMessages };
}
