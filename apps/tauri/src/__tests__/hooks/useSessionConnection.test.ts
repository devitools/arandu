import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockInvoke = globalThis.__TAURI__.core.invoke as ReturnType<typeof vi.fn>;
const mockListen = globalThis.__TAURI__.event.listen as ReturnType<typeof vi.fn>;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useSessionConnection } from "@/hooks/useSessionConnection";

let capturedListeners: Record<string, (event: { payload: unknown }) => void>;

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  capturedListeners = {};

  mockListen.mockImplementation((eventName: string, handler: (event: { payload: unknown }) => void) => {
    capturedListeners[eventName] = handler;
    return Promise.resolve(() => {});
  });

  // Default: session not connected
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "acp_session_status") return Promise.resolve("disconnected");
    if (cmd === "acp_session_check_health") return Promise.resolve("connected");
    return Promise.resolve();
  });
});

describe("useSessionConnection", () => {
  it("starts with idle status", () => {
    const { result } = renderHook(() => useSessionConnection("sess-1"));
    expect(result.current.status).toBe("idle");
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });

  it("checks live status on mount", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("connected");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => expect(result.current.status).toBe("connected"));

    expect(mockInvoke).toHaveBeenCalledWith("acp_session_status", { sessionId: "sess-1" });
    expect(result.current.isConnected).toBe(true);
  });

  it("connect() calls acp_session_connect and returns copilot session id", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("disconnected");
      if (cmd === "acp_session_connect") return Promise.resolve("copilot-abc123");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    let copilotId: string | null = null;
    await act(async () => {
      copilotId = await result.current.connect({ workspacePath: "/workspace/path" });
    });

    expect(copilotId).toBe("copilot-abc123");
    expect(mockInvoke).toHaveBeenCalledWith("acp_session_connect", expect.objectContaining({
      sessionId: "sess-1",
      workspacePath: "/workspace/path",
    }));
    expect(result.current.status).toBe("connected");
    expect(result.current.isConnected).toBe(true);
  });

  it("connect() failure sets status to disconnected and returns null", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("disconnected");
      if (cmd === "acp_session_connect") return Promise.reject("spawn failed");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    let copilotId: string | null = "initial";
    await act(async () => {
      copilotId = await result.current.connect({ workspacePath: "/workspace/path" });
    });

    expect(copilotId).toBeNull();
    expect(result.current.status).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
  });

  it("connect() passes optional acpSessionId for resume", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("disconnected");
      if (cmd === "acp_session_connect") return Promise.resolve("copilot-resume");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await act(async () => {
      await result.current.connect({ workspacePath: "/workspace/path", acpSessionId: "existing-acp-id" });
    });

    expect(mockInvoke).toHaveBeenCalledWith("acp_session_connect", expect.objectContaining({
      acpSessionId: "existing-acp-id",
    }));
  });

  it("disconnect() calls acp_session_disconnect and sets disconnected", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("connected");
      if (cmd === "acp_session_disconnect") return Promise.resolve();
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockInvoke).toHaveBeenCalledWith("acp_session_disconnect", { sessionId: "sess-1" });
    expect(result.current.status).toBe("disconnected");
  });

  it("responds to acp:session-status events for its sessionId", async () => {
    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => expect(capturedListeners["acp:session-status"]).toBeDefined());

    act(() => {
      capturedListeners["acp:session-status"]({
        payload: { sessionId: "sess-1", status: "connected" },
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.isConnected).toBe(true);
  });

  it("ignores acp:session-status events for other sessions", async () => {
    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => expect(capturedListeners["acp:session-status"]).toBeDefined());

    act(() => {
      capturedListeners["acp:session-status"]({
        payload: { sessionId: "sess-other", status: "connected" },
      });
    });

    expect(result.current.isConnected).toBe(false);
  });

  it("transitions through connecting status during connect()", async () => {
    let resolveConnect: (v: string) => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("disconnected");
      if (cmd === "acp_session_connect") {
        return new Promise<string>((resolve) => { resolveConnect = resolve; });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    act(() => { void result.current.connect({ workspacePath: "/workspace" }); });

    expect(result.current.isConnecting).toBe(true);
    expect(result.current.status).toBe("connecting");

    await act(async () => { resolveConnect!("done-id"); });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.status).toBe("connected");
  });

  it("health check interval fires acp_session_check_health after 30s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("connected");
      if (cmd === "acp_session_check_health") return Promise.resolve("connected");
      return Promise.resolve();
    });

    renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("acp_session_status", { sessionId: "sess-1" });
    });

    mockInvoke.mockClear();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_check_health") return Promise.resolve("connected");
      return Promise.resolve();
    });

    await act(async () => { vi.advanceTimersByTime(30_000); });

    expect(mockInvoke).toHaveBeenCalledWith("acp_session_check_health", { sessionId: "sess-1" });

    vi.useRealTimers();
  });

  it("acp:connection-status event with matching workspaceId updates status", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("connected");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => expect(capturedListeners["acp:connection-status"]).toBeDefined());

    act(() => {
      capturedListeners["acp:connection-status"]({
        payload: { workspaceId: "sess-1", status: "disconnected" },
      });
    });

    expect(result.current.status).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
  });

  it("ignores acp:connection-status events for other workspaceIds", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("connected");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => expect(result.current.status).toBe("connected"));
    await waitFor(() => expect(capturedListeners["acp:connection-status"]).toBeDefined());

    act(() => {
      capturedListeners["acp:connection-status"]({
        payload: { workspaceId: "other-session", status: "disconnected" },
      });
    });

    expect(result.current.status).toBe("connected");
  });

  it("visibility change triggers health check when connected", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_status") return Promise.resolve("connected");
      if (cmd === "acp_session_check_health") return Promise.resolve("connected");
      return Promise.resolve();
    });

    renderHook(() => useSessionConnection("sess-1"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("acp_session_status", { sessionId: "sess-1" });
    });

    mockInvoke.mockClear();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_session_check_health") return Promise.resolve("connected");
      return Promise.resolve();
    });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("acp_session_check_health", { sessionId: "sess-1" });
    });
  });
});
