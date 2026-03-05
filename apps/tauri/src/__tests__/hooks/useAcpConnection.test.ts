import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAcpConnection } from "@/hooks/useAcpConnection";
import { clearWorkspaceCaches } from "@/lib/session-cache";

const mockInvoke = globalThis.__TAURI__.core.invoke as ReturnType<typeof vi.fn>;
const mockListen = globalThis.__TAURI__.event.listen as ReturnType<typeof vi.fn>;

let capturedListeners: Record<string, (event: { payload: unknown }) => void>;

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  capturedListeners = {};

  mockListen.mockImplementation((eventName: string, handler: (event: { payload: unknown }) => void) => {
    capturedListeners[eventName] = handler;
    return Promise.resolve(() => {});
  });

  mockInvoke.mockImplementation(() => Promise.resolve());
  localStorage.clear();
  clearWorkspaceCaches("ws-1");
  clearWorkspaceCaches("ws-2");
  clearWorkspaceCaches("ws-other");
});

describe("useAcpConnection", () => {
  it("starts with idle status", () => {
    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));
    expect(result.current.connectionStatus).toBe("idle");
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.connectionError).toBeNull();
  });

  it("connect() calls acp_connect and transitions to connecting", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_connect") return Promise.resolve();
      if (cmd === "acp_check_health") return Promise.resolve("connected");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    await act(async () => {
      await result.current.connect();
    });

    expect(mockInvoke).toHaveBeenCalledWith("acp_connect", expect.objectContaining({
      workspaceId: "ws-1",
      cwd: "/path",
    }));
    expect(result.current.connectionStatus).toBe("connected");
    expect(result.current.isConnected).toBe(true);
  });

  it("connect() failure sets connectionError and status to disconnected", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_connect") return Promise.reject("spawn failed");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.connectionError).toBe("spawn failed");
    expect(result.current.connectionStatus).toBe("disconnected");
    expect(result.current.isConnected).toBe(false);
  });

  it("disconnect() calls acp_disconnect and resets to idle", async () => {
    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    await act(async () => {
      await result.current.disconnect();
    });

    expect(mockInvoke).toHaveBeenCalledWith("acp_disconnect", { workspaceId: "ws-1" });
    expect(result.current.connectionStatus).toBe("idle");
  });

  it("ignores connect() when already connecting", async () => {
    let resolveConnect: () => void;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_connect") {
        return new Promise<void>((resolve) => { resolveConnect = resolve; });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    act(() => {
      result.current.connect();
    });

    expect(result.current.isConnecting).toBe(true);

    await act(async () => {
      result.current.connect();
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect!();
    });
  });

  it("resets state when workspaceId changes", () => {
    const { result, rerender } = renderHook(
      ({ wsId }) => useAcpConnection(wsId, "/path"),
      { initialProps: { wsId: "ws-1" } }
    );

    expect(result.current.connectionStatus).toBe("idle");

    rerender({ wsId: "ws-2" });

    expect(result.current.connectionStatus).toBe("idle");
    expect(result.current.connectionError).toBeNull();
  });

  it("responds to acp:connection-status events", async () => {
    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListeners["acp:connection-status"]).toBeDefined());
    });

    act(() => {
      capturedListeners["acp:connection-status"]({
        payload: { workspaceId: "ws-1", status: "connected" },
      });
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionStatus).toBe("connected");
  });

  it("ignores events for different workspaceId", async () => {
    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListeners["acp:connection-status"]).toBeDefined());
    });

    act(() => {
      capturedListeners["acp:connection-status"]({
        payload: { workspaceId: "ws-other", status: "connected" },
      });
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionStatus).toBe("idle");
  });

  it("does not disconnect on unmount (connection stays alive for restore)", () => {
    const { unmount } = renderHook(() => useAcpConnection("ws-1", "/path"));

    unmount();

    expect(mockInvoke).not.toHaveBeenCalledWith("acp_disconnect", expect.anything());
  });

  it("reads localStorage for copilot path and gh token", async () => {
    localStorage.setItem("arandu-copilot-path", "/custom/copilot");
    localStorage.setItem("arandu-gh-token", "ghp_test123");

    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_connect") return Promise.resolve();
      if (cmd === "acp_check_health") return Promise.resolve("connected");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useAcpConnection("ws-1", "/path"));

    await act(async () => {
      await result.current.connect();
    });

    expect(mockInvoke).toHaveBeenCalledWith("acp_connect", expect.objectContaining({
      binaryPath: "/custom/copilot",
      ghToken: "ghp_test123",
    }));
  });
});
