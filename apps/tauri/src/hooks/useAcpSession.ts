import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AcpMessage,
  AcpPreferences,
  AcpSessionConfigOption,
  AcpSessionInfo,
  AcpSessionMode,
} from "@/types/acp";
import {
  addSystemNotice,
  addUserMessage,
  sessionStore,
  subscribeSession,
  type SessionEntry,
  updateSessionEntry,
} from "@/lib/session-cache";

interface SessionRecordPreferences {
  acp_preferences_json: string;
}

interface UseAcpSessionReturn {
  isStreaming: boolean;
  errors: string[];
  messages: AcpMessage[];
  currentMode: string | null;
  availableModes: AcpSessionMode[];
  availableConfigOptions: AcpSessionConfigOption[];
  selectedConfigOptions: Record<string, string>;
  activeAcpSessionId: string | null;
  agentPlanFilePath: string | null;
  startSession: (acpSessionId?: string) => Promise<string>;
  sendPrompt: (text: string) => Promise<void>;
  setMode: (
    mode: string,
    options?: { origin?: "user" | "workflow" }
  ) => Promise<boolean>;
  setConfigOption: (configId: string, optionId: string) => Promise<boolean>;
  cancel: () => Promise<void>;
  appendNotice: (text: string) => void;
  clearErrors: () => void;
  clearMessages: () => void;
}

function normalizeSelectedConfigOptions(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [configId, selected] of Object.entries(raw)) {
    if (typeof selected === "string") {
      normalized[configId] = selected;
      continue;
    }
    if (!selected || typeof selected !== "object") continue;
    const selectedRecord = selected as Record<string, unknown>;
    const optionId =
      (typeof selectedRecord.optionId === "string" && selectedRecord.optionId) ||
      (typeof selectedRecord.id === "string" && selectedRecord.id) ||
      (typeof selectedRecord.value === "string" && selectedRecord.value) ||
      null;
    if (optionId) normalized[configId] = optionId;
  }
  return normalized;
}

function extractSessionState(
  info: AcpSessionInfo
): Pick<
  SessionEntry,
  "availableModes" | "currentMode" | "availableConfigOptions" | "selectedConfigOptions"
> {
  const availableModes = info.modes?.availableModes ?? [];
  const currentMode = info.modes?.currentModeId ?? null;
  const availableConfigOptions = info.configOptions?.availableConfigOptions ?? [];
  const selectedConfigOptions = normalizeSelectedConfigOptions(
    info.configOptions?.selectedConfigOptions
  );
  return {
    availableModes,
    currentMode,
    availableConfigOptions,
    selectedConfigOptions,
  };
}

function parsePreferencesJson(raw: string | null | undefined): AcpPreferences {
  if (!raw?.trim()) {
    return { modeId: null, selectedConfigOptions: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AcpPreferences>;
    const modeId = typeof parsed.modeId === "string" ? parsed.modeId : null;
    const selectedConfigOptions = normalizeSelectedConfigOptions(
      parsed.selectedConfigOptions
    );
    return { modeId, selectedConfigOptions };
  } catch {
    return { modeId: null, selectedConfigOptions: {} };
  }
}

function isEmptyPreferences(prefs: AcpPreferences): boolean {
  return !prefs.modeId && Object.keys(prefs.selectedConfigOptions).length === 0;
}

function optionIdFromValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return (
    (typeof record.optionId === "string" && record.optionId) ||
    (typeof record.id === "string" && record.id) ||
    (typeof record.value === "string" && record.value) ||
    null
  );
}

function hasConfigOption(
  configOptions: AcpSessionConfigOption[],
  configId: string,
  optionId: string
): boolean {
  const config = configOptions.find((item) => item.id === configId);
  if (!config) return false;
  const options = config.options ?? [];
  return options.some((option) => optionIdFromValue(option) === optionId);
}

const EMPTY_SESSION: SessionEntry = {
  messages: [],
  activeAcpSessionId: null,
  currentMode: null,
  availableModes: [],
  availableConfigOptions: [],
  selectedConfigOptions: {},
  agentPlanFilePath: null,
  isStreaming: false,
};

export function useAcpSession(
  workspaceId: string,
  workspacePath: string,
  localSessionId: string,
  isConnected: boolean
): UseAcpSessionReturn {
  const cached = sessionStore.get(workspaceId);

  const [messages, setMessages] = useState<AcpMessage[]>(cached?.messages ?? []);
  const [isStreaming, setIsStreaming] = useState(cached?.isStreaming ?? false);
  const [currentMode, setCurrentMode] = useState<string | null>(cached?.currentMode ?? null);
  const [availableModes, setAvailableModes] = useState<AcpSessionMode[]>(
    cached?.availableModes ?? []
  );
  const [availableConfigOptions, setAvailableConfigOptions] = useState<
    AcpSessionConfigOption[]
  >(cached?.availableConfigOptions ?? []);
  const [selectedConfigOptions, setSelectedConfigOptions] = useState<
    Record<string, string>
  >(cached?.selectedConfigOptions ?? {});
  const [activeAcpSessionId, setActiveAcpSessionId] = useState<string | null>(
    cached?.activeAcpSessionId ?? null
  );
  const [agentPlanFilePath, setAgentPlanFilePath] = useState<string | null>(
    cached?.agentPlanFilePath ?? null
  );
  const [errors, setErrors] = useState<string[]>([]);

  const activeAcpSessionIdRef = useRef<string | null>(cached?.activeAcpSessionId ?? null);
  const localSessionIdRef = useRef(localSessionId);
  localSessionIdRef.current = localSessionId;
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const entry = sessionStore.get(workspaceId);
    if (entry) {
      setMessages(entry.messages);
      setIsStreaming(entry.isStreaming);
      setCurrentMode(entry.currentMode);
      setAvailableModes(entry.availableModes);
      setAvailableConfigOptions(entry.availableConfigOptions);
      setSelectedConfigOptions(entry.selectedConfigOptions);
      setActiveAcpSessionId(entry.activeAcpSessionId);
      setAgentPlanFilePath(entry.agentPlanFilePath);
      activeAcpSessionIdRef.current = entry.activeAcpSessionId;
    }

    const unsubscribe = subscribeSession(workspaceId, (entryUpdate) => {
      setMessages(entryUpdate.messages);
      setCurrentMode(entryUpdate.currentMode);
      setAvailableModes(entryUpdate.availableModes);
      setAvailableConfigOptions(entryUpdate.availableConfigOptions);
      setSelectedConfigOptions(entryUpdate.selectedConfigOptions);
      setActiveAcpSessionId(entryUpdate.activeAcpSessionId);
      setAgentPlanFilePath(entryUpdate.agentPlanFilePath);
      activeAcpSessionIdRef.current = entryUpdate.activeAcpSessionId;

      if (entryUpdate.isStreaming) {
        setIsStreaming(true);
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => setIsStreaming(false), 800);
      } else {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        setIsStreaming(false);
      }
    });

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      unsubscribe();
    };
  }, [workspaceId]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const persistSessionAndWorkspace = useCallback(
    (preferences: AcpPreferences) => {
      const payload = JSON.stringify(preferences);
      persistQueueRef.current = persistQueueRef.current.then(async () => {
        try {
          await invoke("session_update_acp_preferences", {
            id: localSessionIdRef.current,
            acpPreferencesJson: payload,
          });
        } catch (e) {
          setErrors((prev) => [...prev, String(e)]);
        }

        try {
          await invoke("workspace_acp_defaults_set", {
            workspacePath: workspacePathRef.current,
            acpPreferencesJson: payload,
          });
        } catch (e) {
          setErrors((prev) => [...prev, String(e)]);
        }
      });
    },
    []
  );

  const persistSessionOnly = useCallback((preferences: AcpPreferences) => {
    const payload = JSON.stringify(preferences);
    persistQueueRef.current = persistQueueRef.current.then(async () => {
      try {
        await invoke("session_update_acp_preferences", {
          id: localSessionIdRef.current,
          acpPreferencesJson: payload,
        });
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
      }
    });
  }, []);

  const setMode = useCallback(
    async (
      mode: string,
      options?: { origin?: "user" | "workflow" }
    ): Promise<boolean> => {
      const sid = activeAcpSessionIdRef.current;
      if (!sid) return false;
      const existing = sessionStore.get(workspaceId);
      if (existing?.currentMode === mode) return false;

      try {
        await invoke("acp_set_mode", {
          workspaceId,
          sessionId: sid,
          mode,
        });
        updateSessionEntry(workspaceId, { currentMode: mode });

        if ((options?.origin ?? "user") === "user") {
          const updated = sessionStore.get(workspaceId);
          if (updated) {
            persistSessionAndWorkspace({
              modeId: mode,
              selectedConfigOptions: { ...updated.selectedConfigOptions },
            });
          }
        }
        return true;
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
        return false;
      }
    },
    [workspaceId, persistSessionAndWorkspace]
  );

  const setConfigOption = useCallback(
    async (configId: string, optionId: string): Promise<boolean> => {
      const sid = activeAcpSessionIdRef.current;
      if (!sid) return false;

      const existing = sessionStore.get(workspaceId);
      if (!existing) return false;
      if (!hasConfigOption(existing.availableConfigOptions, configId, optionId)) {
        return false;
      }
      if (existing.selectedConfigOptions[configId] === optionId) return false;

      try {
        await invoke("acp_set_config_option", {
          workspaceId,
          sessionId: sid,
          configId,
          optionId,
        });
        const nextSelected = {
          ...existing.selectedConfigOptions,
          [configId]: optionId,
        };
        updateSessionEntry(workspaceId, { selectedConfigOptions: nextSelected });
        persistSessionAndWorkspace({
          modeId: existing.currentMode,
          selectedConfigOptions: nextSelected,
        });
        return true;
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
        return false;
      }
    },
    [workspaceId, persistSessionAndWorkspace]
  );

  const applyInitialPreferences = useCallback(
    async (acpSessionId: string) => {
      const sessionRecord = await invoke<SessionRecordPreferences>("session_get", {
        id: localSessionIdRef.current,
      });
      const sessionPreferences = parsePreferencesJson(sessionRecord.acp_preferences_json);

      let source: "session" | "workspace" = "session";
      let preferencesToApply = sessionPreferences;
      if (isEmptyPreferences(preferencesToApply)) {
        const workspaceDefaults = await invoke<string | null>(
          "workspace_acp_defaults_get",
          { workspacePath: workspacePathRef.current }
        );
        const parsedWorkspace = parsePreferencesJson(workspaceDefaults ?? "{}");
        if (!isEmptyPreferences(parsedWorkspace)) {
          source = "workspace";
          preferencesToApply = parsedWorkspace;
        }
      }

      if (isEmptyPreferences(preferencesToApply)) return;

      const currentEntry = sessionStore.get(workspaceId);
      if (!currentEntry) return;

      const applied: AcpPreferences = {
        modeId: null,
        selectedConfigOptions: {},
      };

      if (
        preferencesToApply.modeId &&
        currentEntry.availableModes.some((mode) => mode.id === preferencesToApply.modeId)
      ) {
        const changed = await setMode(preferencesToApply.modeId, { origin: "workflow" });
        const modeAfter = changed
          ? preferencesToApply.modeId
          : sessionStore.get(workspaceId)?.currentMode ?? currentEntry.currentMode;
        applied.modeId = modeAfter;
      } else {
        applied.modeId = currentEntry.currentMode;
      }

      for (const [configId, optionId] of Object.entries(
        preferencesToApply.selectedConfigOptions
      )) {
        const latest = sessionStore.get(workspaceId);
        if (!latest) break;
        if (!hasConfigOption(latest.availableConfigOptions, configId, optionId)) continue;
        try {
          await invoke("acp_set_config_option", {
            workspaceId,
            sessionId: acpSessionId,
            configId,
            optionId,
          });
          const nextSelected = {
            ...(sessionStore.get(workspaceId)?.selectedConfigOptions ?? {}),
            [configId]: optionId,
          };
          updateSessionEntry(workspaceId, { selectedConfigOptions: nextSelected });
          applied.selectedConfigOptions[configId] = optionId;
        } catch {
          // Ignore stale/invalid config values without failing session startup.
        }
      }

      if (source === "workspace") {
        persistSessionOnly(applied);
      } else {
        const expected = JSON.stringify(preferencesToApply);
        const normalizedApplied = JSON.stringify(applied);
        if (expected !== normalizedApplied) {
          persistSessionOnly(applied);
        }
      }
    },
    [workspaceId, setMode, persistSessionOnly]
  );

  const startSession = useCallback(
    async (existingAcpSessionId?: string): Promise<string> => {
      if (!isConnected) throw new Error("Not connected to ACP");

      setErrors([]);

      let acpId: string;
      let info: AcpSessionInfo | null = null;

      if (existingAcpSessionId) {
        const previousEntry = sessionStore.get(workspaceId);

        const fresh: SessionEntry = {
          ...EMPTY_SESSION,
          activeAcpSessionId: existingAcpSessionId,
        };
        sessionStore.set(workspaceId, fresh);
        setMessages([]);
        setIsStreaming(false);
        setCurrentMode(null);
        setAvailableModes([]);
        setAvailableConfigOptions([]);
        setSelectedConfigOptions({});
        setActiveAcpSessionId(null);
        setAgentPlanFilePath(null);

        try {
          info = await invoke<AcpSessionInfo>("acp_load_session", {
            workspaceId,
            sessionId: existingAcpSessionId,
            cwd: workspacePathRef.current,
          });
          acpId = info.sessionId;
        } catch (e) {
          if (String(e).includes("already loaded")) {
            acpId = existingAcpSessionId;
            if (previousEntry) {
              updateSessionEntry(workspaceId, {
                messages: previousEntry.messages,
                currentMode: previousEntry.currentMode,
                availableModes: previousEntry.availableModes,
                availableConfigOptions: previousEntry.availableConfigOptions,
                selectedConfigOptions: previousEntry.selectedConfigOptions,
              });
            }
          } else {
            throw e;
          }
        }
      } else {
        const fresh: SessionEntry = { ...EMPTY_SESSION };
        sessionStore.set(workspaceId, fresh);
        setMessages([]);
        setIsStreaming(false);
        setCurrentMode(null);
        setAvailableModes([]);
        setAvailableConfigOptions([]);
        setSelectedConfigOptions({});
        setActiveAcpSessionId(null);
        setAgentPlanFilePath(null);

        info = await invoke<AcpSessionInfo>("acp_new_session", {
          workspaceId,
          cwd: workspacePathRef.current,
        });
        acpId = info.sessionId;
      }

      activeAcpSessionIdRef.current = acpId;
      if (info) {
        updateSessionEntry(workspaceId, {
          activeAcpSessionId: acpId,
          ...extractSessionState(info),
        });
      } else {
        updateSessionEntry(workspaceId, { activeAcpSessionId: acpId });
      }

      try {
        await applyInitialPreferences(acpId);
      } catch (e) {
        setErrors((prev) => [...prev, String(e)]);
      }

      return acpId;
    },
    [isConnected, workspaceId, applyInitialPreferences]
  );

  const sendPrompt = useCallback(
    async (text: string) => {
      const sid = activeAcpSessionIdRef.current;
      if (!sid) return;

      addUserMessage(workspaceId, text);

      try {
        await invoke("acp_send_prompt", {
          workspaceId,
          sessionId: sid,
          text,
        });
      } catch (e) {
        const err = String(e);
        if (err.includes("not found") || err.includes("-32602")) {
          try {
            await invoke("acp_load_session", {
              workspaceId,
              sessionId: sid,
              cwd: workspacePathRef.current,
            });
            await invoke("acp_send_prompt", {
              workspaceId,
              sessionId: sid,
              text,
            });
            return;
          } catch {
            // reload failed — fall through to show original error
          }
        }
        setErrors((prev) => [...prev, err]);
        updateSessionEntry(workspaceId, { isStreaming: false });
      }
    },
    [workspaceId]
  );

  const cancel = useCallback(async () => {
    const sid = activeAcpSessionIdRef.current;
    if (!sid) return;
    try {
      await invoke("acp_cancel", {
        workspaceId,
        sessionId: sid,
      });
      updateSessionEntry(workspaceId, { isStreaming: false });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [workspaceId]);

  const appendNotice = useCallback(
    (text: string) => {
      addSystemNotice(workspaceId, text);
    },
    [workspaceId]
  );

  const clearErrors = useCallback(() => setErrors([]), []);
  const clearMessages = useCallback(() => {
    updateSessionEntry(workspaceId, { messages: [] });
  }, [workspaceId]);

  return {
    isStreaming,
    errors,
    messages,
    currentMode,
    availableModes,
    availableConfigOptions,
    selectedConfigOptions,
    activeAcpSessionId,
    agentPlanFilePath,
    startSession,
    sendPrompt,
    setMode,
    setConfigOption,
    cancel,
    appendNotice,
    clearErrors,
    clearMessages,
  };
}
