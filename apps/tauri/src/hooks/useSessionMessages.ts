import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AcpMessage } from "@/types/acp";
import { subscribeSession, resetSessionMessages } from "@/lib/session-cache";

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
  addOptimisticUserMessage: (text: string) => void;
  messages: AcpMessage[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

export function useSessionMessages(sessionId: string): UseSessionMessagesReturn {
  const [messages, setMessages] = useState<AcpMessage[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<AcpMessage[]>([]);
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
      console.debug("[messages] loadInitial: session=%s loaded=%d", sessionId, records.length);
      offsetRef.current = records.length;
      setHasMore(records.length === PAGE_SIZE);
      setMessages(records.map(toAcpMessage));
      setStreamingMessages([]);
    } catch (e) {
      console.error("[messages] loadInitial error:", e);
    } finally {
      setIsLoadingInitial(false);
    }
  }, [sessionId]);

  useEffect(() => {
    offsetRef.current = 0;
    setHasMore(true);
    void loadInitial();
  }, [loadInitial]);

  const addOptimisticUserMessage = useCallback((text: string) => {
    const optimisticMsg: AcpMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
  }, []);

  useEffect(() => {
    const unlisten = window.__TAURI__.event.listen<{
      sessionId: string;
      id: string;
      content: string;
    }>("acp:user-message-saved", (event) => {
      const { sessionId: msgSessionId, id, content } = event.payload;
      console.debug("[messages] user-message-saved: session=%s id=%s", msgSessionId, id);
      if (msgSessionId !== sessionId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === id)) return prev;
        const withoutOptimistic = prev.filter(
          (m) => !(m.id.startsWith("optimistic-") && m.role === "user" && m.content === content)
        );
        return [...withoutOptimistic, { id, role: "user", content, timestamp: new Date() }];
      });
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [sessionId]);

  useEffect(() => {
    const unlisten = window.__TAURI__.event.listen<{
      sessionId: string;
      messages: MessageRecord[];
    }>("acp:assistant-message-saved", (event) => {
      const { sessionId: msgSessionId, messages: records } = event.payload;
      console.debug("[messages] assistant-message-saved: session=%s count=%d", msgSessionId, records.length);
      if (msgSessionId !== sessionId) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMsgs = records.filter((r) => !existingIds.has(r.id)).map(toAcpMessage);
        if (newMsgs.length === 0) return prev;
        return [...prev, ...newMsgs];
      });
      setStreamingMessages([]);
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, [sessionId]);

  useEffect(() => {
    const unsub = subscribeSession(sessionId, (entry) => {
      setStreamingMessages(entry.messages);
    });
    resetSessionMessages(sessionId);
    return () => { unsub(); };
  }, [sessionId]);

  const loadMore = useCallback(async () => {
    if (isLoadingInitial || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const records = await invoke<MessageRecord[]>("messages_list", {
        sessionId,
        offset: offsetRef.current,
        limit: PAGE_SIZE,
      });
      offsetRef.current += records.length;
      setHasMore(records.length === PAGE_SIZE);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const older = records.filter((r) => !existingIds.has(r.id)).map(toAcpMessage);
        if (older.length === 0) return prev;
        return [...older, ...prev];
      });
    } catch (e) {
      console.error("[useSessionMessages] loadMore error:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [sessionId, isLoadingInitial, isLoadingMore, hasMore]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingMessages([]);
  }, []);

  const merged = useMemo(() => {
    if (streamingMessages.length === 0) return messages;
    return [...messages, ...streamingMessages];
  }, [messages, streamingMessages]);

  return { messages: merged, isLoadingInitial, isLoadingMore, hasMore, loadMore, clearMessages, addOptimisticUserMessage };
}
