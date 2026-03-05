import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAcpLogs } from "@/hooks/useAcpLogs";
import type { AcpConnectionLogEntry } from "@/types/acp";

const mockListen = globalThis.__TAURI__.event.listen as ReturnType<typeof vi.fn>;

let capturedListener: ((event: { payload: AcpConnectionLogEntry }) => void) | null;
let unlistenFn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockListen.mockReset();
  capturedListener = null;
  unlistenFn = vi.fn();

  mockListen.mockImplementation((_eventName: string, handler: (event: { payload: AcpConnectionLogEntry }) => void) => {
    capturedListener = handler;
    return Promise.resolve(unlistenFn);
  });
});

function makeLog(overrides: Partial<AcpConnectionLogEntry> = {}): AcpConnectionLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: "info",
    event: "connect",
    message: "Connected",
    workspaceId: "ws-1",
    ...overrides,
  };
}

describe("useAcpLogs", () => {
  it("starts with empty logs", () => {
    const { result } = renderHook(() => useAcpLogs("ws-1"));
    expect(result.current.logs).toEqual([]);
    expect(result.current.hasRecentErrors).toBe(false);
  });

  it("accumulates log entries from acp:log events", async () => {
    const { result } = renderHook(() => useAcpLogs("ws-1"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListener).not.toBeNull());
    });

    act(() => {
      capturedListener!({ payload: makeLog({ message: "First" }) });
    });
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].message).toBe("First");

    act(() => {
      capturedListener!({ payload: makeLog({ message: "Second" }) });
    });
    expect(result.current.logs).toHaveLength(2);
  });

  it("caps at 200 entries", async () => {
    const { result } = renderHook(() => useAcpLogs("ws-1"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListener).not.toBeNull());
    });

    act(() => {
      for (let i = 0; i < 210; i++) {
        capturedListener!({ payload: makeLog({ message: `Log ${i}` }) });
      }
    });

    expect(result.current.logs).toHaveLength(200);
    expect(result.current.logs[0].message).toBe("Log 10");
    expect(result.current.logs[199].message).toBe("Log 209");
  });

  it("filters by workspaceId", async () => {
    const { result } = renderHook(() => useAcpLogs("ws-1"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListener).not.toBeNull());
    });

    act(() => {
      capturedListener!({ payload: makeLog({ workspaceId: "ws-other", message: "Other" }) });
    });

    expect(result.current.logs).toHaveLength(0);

    act(() => {
      capturedListener!({ payload: makeLog({ workspaceId: "ws-1", message: "Mine" }) });
    });

    expect(result.current.logs).toHaveLength(1);
  });

  it("clearLogs() empties the array", async () => {
    const { result } = renderHook(() => useAcpLogs("ws-1"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListener).not.toBeNull());
    });

    act(() => {
      capturedListener!({ payload: makeLog() });
      capturedListener!({ payload: makeLog() });
    });
    expect(result.current.logs).toHaveLength(2);

    act(() => {
      result.current.clearLogs();
    });
    expect(result.current.logs).toHaveLength(0);
  });

  it("cleans up listener on unmount", async () => {
    const { unmount } = renderHook(() => useAcpLogs("ws-1"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListener).not.toBeNull());
    });

    unmount();

    expect(unlistenFn).toHaveBeenCalled();
  });

  it("hasRecentErrors is true when error-level logs exist", async () => {
    const { result } = renderHook(() => useAcpLogs("ws-1"));

    await act(async () => {
      await vi.waitFor(() => expect(capturedListener).not.toBeNull());
    });

    act(() => {
      capturedListener!({ payload: makeLog({ level: "info" }) });
    });
    expect(result.current.hasRecentErrors).toBe(false);

    act(() => {
      capturedListener!({ payload: makeLog({ level: "error" }) });
    });
    expect(result.current.hasRecentErrors).toBe(true);
  });
});
