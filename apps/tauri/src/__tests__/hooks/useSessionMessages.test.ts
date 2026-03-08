import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { subscribeSession, clearWorkspaceCaches, updateSessionEntry } from "@/lib/session-cache";

const mockInvoke = globalThis.__TAURI__.core.invoke as ReturnType<typeof vi.fn>;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useSessionMessages } from "@/hooks/useSessionMessages";
const mockListen = globalThis.__TAURI__.event.listen as ReturnType<typeof vi.fn>;

const makeRecord = (id: string, role: "user" | "assistant", content: string, created_at = 1704067200) => ({
  id,
  session_id: "sess-1",
  role,
  content,
  message_type: null,
  tool_call_id: null,
  tool_title: null,
  tool_status: null,
  created_at,
});

const eventListeners = new Map<string, Array<(event: unknown) => void>>();

function emitTauriEvent(eventName: string, payload: unknown) {
  eventListeners.get(eventName)?.forEach((cb) => cb({ payload }));
}

mockListen.mockImplementation((eventName: string, cb: (event: unknown) => void) => {
  if (!eventListeners.has(eventName)) eventListeners.set(eventName, []);
  eventListeners.get(eventName)!.push(cb);
  return Promise.resolve(() => {
    const arr = eventListeners.get(eventName);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
  });
});

beforeEach(() => {
  mockInvoke.mockReset();
  eventListeners.clear();
  clearWorkspaceCaches("sess-1");
  mockInvoke.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSessionMessages", () => {
  it("loads messages from SQLite on mount", async () => {
    const records = [makeRecord("msg-1", "user", "Hello"), makeRecord("msg-2", "assistant", "Hi there")];
    mockInvoke.mockResolvedValue(records);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    expect(mockInvoke).toHaveBeenCalledWith("messages_list", { sessionId: "sess-1", offset: 0, limit: 50 });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("Hello");
    expect(result.current.messages[1].content).toBe("Hi there");
  });

  it("maps SQLite records to AcpMessage format", async () => {
    const records = [makeRecord("uuid-1", "assistant", "Response text", 1718452800)];
    mockInvoke.mockResolvedValue(records);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    const msg = result.current.messages[0];
    expect(msg.id).toBe("uuid-1");
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBe("Response text");
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it("hasMore is true when exactly PAGE_SIZE records returned", async () => {
    const records = Array.from({ length: 50 }, (_, i) => makeRecord(`msg-${i}`, "user", `msg ${i}`));
    mockInvoke.mockResolvedValue(records);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    expect(result.current.hasMore).toBe(true);
  });

  it("hasMore is false when fewer than PAGE_SIZE records returned", async () => {
    const records = [makeRecord("msg-1", "user", "only one")];
    mockInvoke.mockResolvedValue(records);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    expect(result.current.hasMore).toBe(false);
  });

  it("loadMore prepends older messages", async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) =>
      makeRecord(`new-${i}`, "user", `new ${i}`)
    );
    const olderPage = [makeRecord("old-1", "user", "old message")];

    mockInvoke
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(olderPage);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    await act(async () => { await result.current.loadMore(); });

    expect(result.current.messages[0].content).toBe("old message");
    expect(result.current.messages).toHaveLength(51);
  });

  it("adds user message via acp:user-message-saved event", async () => {
    mockInvoke.mockResolvedValue([]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    act(() => {
      emitTauriEvent("acp:user-message-saved", { sessionId: "sess-1", id: "uuid-saved-1", content: "Hello from user" });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("Hello from user");
    expect(result.current.messages[0].id).toBe("uuid-saved-1");
  });

  it("adds assistant messages via acp:assistant-message-saved event", async () => {
    mockInvoke.mockResolvedValue([]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    act(() => {
      emitTauriEvent("acp:assistant-message-saved", {
        sessionId: "sess-1",
        messages: [
          makeRecord("ast-1", "assistant", "Hello from assistant"),
          makeRecord("ast-2", "assistant", "Second response"),
        ],
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe("assistant");
    expect(result.current.messages[0].content).toBe("Hello from assistant");
    expect(result.current.messages[1].content).toBe("Second response");
  });

  it("adds tool call messages via acp:assistant-message-saved event", async () => {
    mockInvoke.mockResolvedValue([]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    const toolRecord = {
      ...makeRecord("tool-1", "assistant", "Read file: src/main.ts"),
      message_type: "tool",
      tool_call_id: "tc-1",
      tool_title: "Read file",
      tool_status: "completed",
    };

    act(() => {
      emitTauriEvent("acp:assistant-message-saved", {
        sessionId: "sess-1",
        messages: [toolRecord],
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].type).toBe("tool");
    expect(result.current.messages[0].toolCallId).toBe("tc-1");
    expect(result.current.messages[0].toolStatus).toBe("completed");
  });

  it("deduplicates messages by ID", async () => {
    mockInvoke.mockResolvedValue([makeRecord("existing-1", "assistant", "Already here")]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      emitTauriEvent("acp:assistant-message-saved", {
        sessionId: "sess-1",
        messages: [
          makeRecord("existing-1", "assistant", "Already here"),
          makeRecord("new-1", "assistant", "New message"),
        ],
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].id).toBe("new-1");
  });

  it("clears streaming message when assistant-saved arrives", async () => {
    mockInvoke.mockResolvedValue([]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    act(() => {
      updateSessionEntry("sess-1", {
        isStreaming: true,
        messages: [{ id: "stream-1", role: "assistant", content: "partial...", timestamp: new Date() }],
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe("partial...");

    act(() => {
      emitTauriEvent("acp:assistant-message-saved", {
        sessionId: "sess-1",
        messages: [makeRecord("ast-1", "assistant", "final answer")],
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe("ast-1");
    expect(result.current.messages[0].content).toBe("final answer");
  });

  it("shows streaming message appended to persisted messages", async () => {
    mockInvoke.mockResolvedValue([makeRecord("db-1", "user", "Hello")]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      updateSessionEntry("sess-1", {
        isStreaming: true,
        messages: [{ id: "stream-1", role: "assistant", content: "streaming response...", timestamp: new Date() }],
      });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).toBe("db-1");
    expect(result.current.messages[1].content).toBe("streaming response...");
  });

  it("shows all streaming messages (thinking, tool calls, text) during a turn", async () => {
    mockInvoke.mockResolvedValue([makeRecord("db-1", "user", "Hello")]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    act(() => {
      updateSessionEntry("sess-1", {
        isStreaming: true,
        messages: [
          { id: "s-1", role: "assistant", type: "thinking", content: "Thinking...", timestamp: new Date() },
          { id: "s-2", role: "assistant", type: "tool", content: "Read file", toolCallId: "tc-1", toolTitle: "Read", toolStatus: "pending", timestamp: new Date() },
          { id: "s-3", role: "assistant", content: "Here is my response", timestamp: new Date() },
        ],
      });
    });

    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[0].id).toBe("db-1");
    expect(result.current.messages[1].type).toBe("thinking");
    expect(result.current.messages[2].type).toBe("tool");
    expect(result.current.messages[3].content).toBe("Here is my response");
  });

  it("clears streaming messages when streaming stops", async () => {
    mockInvoke.mockResolvedValue([]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    act(() => {
      updateSessionEntry("sess-1", {
        isStreaming: true,
        messages: [{ id: "stream-1", role: "assistant", content: "partial", timestamp: new Date() }],
      });
    });

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      updateSessionEntry("sess-1", { isStreaming: false, messages: [] });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("loadMore deduplicates overlapping records", async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) =>
      makeRecord(`msg-${i}`, "user", `msg ${i}`)
    );
    const overlapPage = [
      makeRecord("msg-0", "user", "msg 0"),
      makeRecord("older-1", "user", "older message"),
    ];

    mockInvoke
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(overlapPage);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));

    await act(async () => { await result.current.loadMore(); });

    const ids = result.current.messages.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(result.current.messages[0].content).toBe("older message");
    expect(result.current.messages).toHaveLength(51);
  });

  it("loadMore is idempotent when hasMore is false", async () => {
    mockInvoke.mockResolvedValue([makeRecord("msg-1", "user", "only one")]);

    const { result } = renderHook(() => useSessionMessages("sess-1"));

    await waitFor(() => expect(result.current.isLoadingInitial).toBe(false));
    expect(result.current.hasMore).toBe(false);

    const callsBefore = mockInvoke.mock.calls.length;
    await act(async () => { await result.current.loadMore(); });

    expect(mockInvoke.mock.calls.length).toBe(callsBefore);
  });

  it("resets state when sessionId changes", async () => {
    const recordsA = [makeRecord("a-1", "user", "Session A message")];
    const recordsB = [makeRecord("b-1", "user", "Session B message")];
    mockInvoke
      .mockResolvedValueOnce(recordsA)
      .mockResolvedValueOnce(recordsB);

    const { result, rerender } = renderHook(
      ({ id }) => useSessionMessages(id),
      { initialProps: { id: "sess-1" } }
    );

    await waitFor(() => expect(result.current.messages[0]?.content).toBe("Session A message"));

    rerender({ id: "sess-2" });

    await waitFor(() => expect(result.current.messages[0]?.content).toBe("Session B message"));

    expect(mockInvoke).toHaveBeenLastCalledWith("messages_list", expect.objectContaining({ sessionId: "sess-2" }));
  });
});
