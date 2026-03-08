import { describe, it, expect, vi, beforeEach } from "vitest";
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
      copilotId = await result.current.connect("/workspace/path");
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
      copilotId = await result.current.connect("/workspace/path");
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
      await result.current.connect("/workspace/path", undefined, undefined, "existing-acp-id");
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

    act(() => { void result.current.connect("/workspace"); });

    expect(result.current.isConnecting).toBe(true);
    expect(result.current.status).toBe("connecting");

    await act(async () => { resolveConnect!("done-id"); });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.status).toBe("connected");
  });
});
