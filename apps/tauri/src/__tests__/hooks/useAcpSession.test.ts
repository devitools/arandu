import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAcpSession } from "@/hooks/useAcpSession";
import { clearWorkspaceCaches, sessionStore, type SessionEntry } from "@/lib/session-cache";
import type { AcpSessionUpdate } from "@/types/acp";

const mockInvoke = globalThis.__TAURI__.core.invoke as ReturnType<typeof vi.fn>;
const mockListen = globalThis.__TAURI__.event.listen as ReturnType<typeof vi.fn>;

let sessionUpdateListener: ((event: { payload: AcpSessionUpdate }) => void) | null = null;

const BASE_ENTRY: SessionEntry = {
  messages: [],
  activeAcpSessionId: "sid-1",
  currentMode: "https://agentclientprotocol.com/protocol/session-modes#ask",
  availableModes: [
    {
      id: "https://agentclientprotocol.com/protocol/session-modes#ask",
      name: "Ask",
    },
    {
      id: "https://agentclientprotocol.com/protocol/session-modes#plan",
      name: "Plan",
    },
    {
      id: "https://agentclientprotocol.com/protocol/session-modes#agent",
      name: "Agent",
    },
  ],
  availableConfigOptions: [
    {
      id: "model",
      name: "Model",
      category: "model",
      options: [{ id: "m1", label: "Model 1" }, { id: "m2", label: "Model 2" }],
    },
  ],
  selectedConfigOptions: { model: "m1" },
  agentPlanFilePath: null,
  isStreaming: false,
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockReset();
  clearWorkspaceCaches("ws-1");
  sessionStore.set("ws-1", { ...BASE_ENTRY });

  mockListen.mockImplementation(
    (eventName: string, handler: (event: { payload: AcpSessionUpdate }) => void) => {
      if (eventName === "acp:session-update") {
        sessionUpdateListener = handler;
      }
      return Promise.resolve(() => {});
    }
  );
});

describe("useAcpSession", () => {
  it("parses mode/config update variants from ACP events", async () => {
    const { result } = renderHook(() =>
      useAcpSession("ws-1", "/repo", "local-session-1", true)
    );

    await act(async () => {
      await vi.waitFor(() => expect(sessionUpdateListener).toBeTruthy());
    });

    act(() => {
      sessionUpdateListener!({
        payload: {
          workspaceId: "ws-1",
          sessionId: "sid-1",
          updateType: "current_mode_update",
          payload: { modeId: "https://agentclientprotocol.com/protocol/session-modes#plan" },
        },
      });
    });
    expect(result.current.currentMode).toBe(
      "https://agentclientprotocol.com/protocol/session-modes#plan"
    );

    act(() => {
      sessionUpdateListener!({
        payload: {
          workspaceId: "ws-1",
          sessionId: "sid-1",
          updateType: "config_option_update",
          payload: { selectedConfigOptions: { model: "m2" } },
        },
      });
    });
    expect(result.current.selectedConfigOptions.model).toBe("m2");

    act(() => {
      sessionUpdateListener!({
        payload: {
          workspaceId: "ws-1",
          sessionId: "sid-1",
          updateType: "config_options_update",
          payload: {
            configOptions: {
              selectedConfigOptions: { model: "m1" },
            },
          },
        },
      });
    });
    expect(result.current.selectedConfigOptions.model).toBe("m1");
  });

  it("applies session preferences over workspace defaults", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_new_session") {
        return Promise.resolve({
          sessionId: "sid-1",
          modes: {
            availableModes: BASE_ENTRY.availableModes,
            currentModeId: BASE_ENTRY.currentMode,
          },
          configOptions: {
            availableConfigOptions: BASE_ENTRY.availableConfigOptions,
            selectedConfigOptions: {},
          },
        });
      }
      if (cmd === "session_get") {
        return Promise.resolve({
          acp_preferences_json:
            '{"modeId":"https://agentclientprotocol.com/protocol/session-modes#agent","selectedConfigOptions":{"model":"m2"}}',
        });
      }
      if (cmd === "workspace_acp_defaults_get") {
        return Promise.resolve(
          '{"modeId":"https://agentclientprotocol.com/protocol/session-modes#plan","selectedConfigOptions":{"model":"m1"}}'
        );
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() =>
      useAcpSession("ws-1", "/repo", "local-session-1", true)
    );

    await act(async () => {
      await result.current.startSession();
    });

    const setModeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "acp_set_mode");
    expect(setModeCalls).toHaveLength(1);
    expect(setModeCalls[0][1]).toMatchObject({
      mode: "https://agentclientprotocol.com/protocol/session-modes#agent",
    });

    const setConfigCalls = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "acp_set_config_option"
    );
    expect(setConfigCalls).toHaveLength(1);
    expect(setConfigCalls[0][1]).toMatchObject({
      configId: "model",
      optionId: "m2",
    });
  });

  it("falls back to workspace defaults when session preferences are empty and ignores stale IDs", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "acp_new_session") {
        return Promise.resolve({
          sessionId: "sid-1",
          modes: {
            availableModes: BASE_ENTRY.availableModes,
            currentModeId: BASE_ENTRY.currentMode,
          },
          configOptions: {
            availableConfigOptions: BASE_ENTRY.availableConfigOptions,
            selectedConfigOptions: {},
          },
        });
      }
      if (cmd === "session_get") {
        return Promise.resolve({
          acp_preferences_json: "{}",
        });
      }
      if (cmd === "workspace_acp_defaults_get") {
        return Promise.resolve(
          '{"modeId":"https://agentclientprotocol.com/protocol/session-modes#plan","selectedConfigOptions":{"model":"invalid","agent":"a1"}}'
        );
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() =>
      useAcpSession("ws-1", "/repo", "local-session-1", true)
    );

    await act(async () => {
      await result.current.startSession();
    });

    const setModeCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "acp_set_mode");
    expect(setModeCalls).toHaveLength(1);
    expect(setModeCalls[0][1]).toMatchObject({
      mode: "https://agentclientprotocol.com/protocol/session-modes#plan",
    });

    const setConfigCalls = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "acp_set_config_option"
    );
    expect(setConfigCalls).toHaveLength(0);
  });

  it("does not persist workflow-forced mode changes, but persists user changes", async () => {
    mockInvoke.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAcpSession("ws-1", "/repo", "local-session-1", true)
    );

    await act(async () => {
      await result.current.setMode(
        "https://agentclientprotocol.com/protocol/session-modes#plan",
        { origin: "workflow" }
      );
    });

    expect(
      mockInvoke.mock.calls.some(([cmd]) => cmd === "session_update_acp_preferences")
    ).toBe(false);

    await act(async () => {
      await result.current.setMode(
        "https://agentclientprotocol.com/protocol/session-modes#agent",
        { origin: "user" }
      );
    });

    await vi.waitFor(() => {
      expect(
        mockInvoke.mock.calls.some(([cmd]) => cmd === "session_update_acp_preferences")
      ).toBe(true);
      expect(
        mockInvoke.mock.calls.some(([cmd]) => cmd === "workspace_acp_defaults_set")
      ).toBe(true);
    });
  });

  it("setConfigOption invokes ACP and persistence commands", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAcpSession("ws-1", "/repo", "local-session-1", true)
    );

    await act(async () => {
      await result.current.setConfigOption("model", "m2");
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "acp_set_config_option",
      expect.objectContaining({
        workspaceId: "ws-1",
        sessionId: "sid-1",
        configId: "model",
        optionId: "m2",
      })
    );

    await vi.waitFor(() => {
      expect(
        mockInvoke.mock.calls.some(([cmd]) => cmd === "session_update_acp_preferences")
      ).toBe(true);
      expect(
        mockInvoke.mock.calls.some(([cmd]) => cmd === "workspace_acp_defaults_set")
      ).toBe(true);
    });
  });
});
