import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { TerminalChat } from "./TerminalChat";
import { MarkdownViewer } from "./MarkdownViewer";
import { useAcpLogs } from "@/hooks/useAcpLogs";
import { usePlanWorkflow } from "@/hooks/usePlanWorkflow";
import { useSessionMessages } from "@/hooks/useSessionMessages";
import { useSessionConnection } from "@/hooks/useSessionConnection";
import { subscribeSession, updateSessionEntry, addSystemNotice } from "@/lib/session-cache";
import { AcpSessionControls } from "@/components/AcpSessionControls";
import type { AcpSessionMode, AcpSessionConfigOption, AcpPreferences } from "@/types/acp";
import { ConnectionLogs } from "@/components/ConnectionLogs";
import type { SessionRecord, PlanPhase } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, FileSearch, FileText, Loader2, Minimize2, Plug, Unplug, RefreshCw } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { copyToClipboard } from "@/lib/utils";

const PHASES: PlanPhase[] = ["idle", "planning", "reviewing", "executing", "done"];

const PHASE_COLORS: Record<PlanPhase, string> = {
  idle: "bg-muted-foreground/30",
  planning: "bg-yellow-500",
  reviewing: "bg-blue-500",
  executing: "bg-green-500",
  done: "bg-purple-500",
};

const PHASE_KEYS: Record<PlanPhase, string> = {
  idle: "plan.phaseIdle",
  planning: "plan.phasePlanning",
  reviewing: "plan.phaseReviewing",
  executing: "plan.phaseExecuting",
  done: "plan.phaseDone",
};

interface ActiveSessionViewProps {
  workspaceId: string;
  workspacePath: string;
  session: SessionRecord;
  onPhaseChange?: (sessionId: string, phase: PlanPhase) => void;
  onMinimize?: () => void;
}

export function ActiveSessionView({
  workspaceId,
  workspacePath,
  session,
  onPhaseChange,
  onMinimize,
}: ActiveSessionViewProps) {
  const initRef = useRef(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const planPanelRef = useRef<ImperativePanelHandle>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  const { t } = useTranslation();

  // Per-session connection (new architecture)
  const sessionConn = useSessionConnection(session.id);
  // Per-session messages loaded from SQLite (new architecture)
  const sessionMessages = useSessionMessages(session.id);

  const isConnected = sessionConn.isConnected;
  const isConnecting = sessionConn.isConnecting;

  // Streaming state from session-cache (new arch events keyed by session.id)
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [availableModes, setAvailableModes] = useState<AcpSessionMode[]>([]);
  const [availableConfigOptions, setAvailableConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [selectedConfigOptions, setSelectedConfigOptions] = useState<Record<string, string>>({});
  const [agentPlanFilePath, setAgentPlanFilePath] = useState<string | null>(null);
  const [activeAcpSessionId, setActiveAcpSessionId] = useState<string | null>(
    session.acp_session_id ?? null
  );
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribeSession(session.id, (entry) => {
      setCurrentMode(entry.currentMode);
      setAvailableModes(entry.availableModes);
      setAvailableConfigOptions(entry.availableConfigOptions);
      setSelectedConfigOptions(entry.selectedConfigOptions);
      setAgentPlanFilePath(entry.agentPlanFilePath);
      if (entry.activeAcpSessionId) setActiveAcpSessionId(entry.activeAcpSessionId);
      if (entry.isStreaming) {
        setIsStreaming(true);
        if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
        streamingTimerRef.current = setTimeout(() => setIsStreaming(false), 800);
      } else {
        if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
        setIsStreaming(false);
      }
    });
    return () => {
      unsub();
      if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
    };
  }, [session.id]);

  // Connection logs (still keyed by workspaceId for backward compat)
  const acpLogs = useAcpLogs(workspaceId);

  // Core ACP actions using new per-session commands
  const sendPrompt = useCallback(async (text: string) => {
    try {
      await invoke("acp_session_send_prompt", { sessionId: session.id, text });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
      updateSessionEntry(session.id, { isStreaming: false });
    }
  }, [session.id]);

  const persistPreferences = useCallback((partial: Partial<AcpPreferences>) => {
    try {
      const raw = session.acp_preferences_json || "{}";
      const current: AcpPreferences = JSON.parse(raw);
      const updated = { ...current, ...partial };
      invoke("session_update_acp_preferences", {
        id: session.id,
        acpPreferencesJson: JSON.stringify(updated),
      }).catch(console.error);
      invoke("workspace_acp_defaults_set", {
        workspacePath,
        acpPreferencesJson: JSON.stringify(updated),
      }).catch(console.error);
    } catch { /* ignore */ }
  }, [session.id, session.acp_preferences_json, workspacePath]);

  const setMode = useCallback(async (mode: string, options?: { origin?: "user" | "workflow" }): Promise<boolean> => {
    try {
      await invoke("acp_session_set_mode", { sessionId: session.id, mode });
      updateSessionEntry(session.id, { currentMode: mode });
      if ((options?.origin ?? "user") === "user") {
        persistPreferences({ modeId: mode });
      }
      return true;
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
      return false;
    }
  }, [session.id, persistPreferences]);

  const setConfigOption = useCallback(async (configId: string, optionId: string) => {
    try {
      await invoke("acp_session_set_config_option", { sessionId: session.id, configId, optionId });
      setSelectedConfigOptions((prev) => {
        const updated = { ...prev, [configId]: optionId };
        updateSessionEntry(session.id, { selectedConfigOptions: updated });
        persistPreferences({ selectedConfigOptions: updated });
        return updated;
      });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [session.id, persistPreferences]);

  const cancel = useCallback(async () => {
    try {
      await invoke("acp_session_cancel", { sessionId: session.id });
      updateSessionEntry(session.id, { isStreaming: false });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [session.id]);

  const clearErrors = useCallback(() => setErrors([]), []);

  const handleClearHistory = useCallback(async () => {
    try {
      await invoke("messages_delete_session", { sessionId: session.id });
      sessionMessages.clearMessages();
      // Send /clear directly without adding it as an optimistic message
      await invoke("acp_session_send_prompt", { sessionId: session.id, text: "/clear" });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [session.id, sessionMessages]);

  const handleAutoSwitchMode = useCallback((modeId: string) => {
    const mode = availableModes.find((m) => m.id === modeId);
    const label = mode?.name ?? modeId.split("#").pop() ?? modeId;
    addSystemNotice(session.id, t("acp.autoSwitchNotice", { mode: label }));
  }, [availableModes, session.id, t]);

  const handleSelectMode = useCallback((modeId: string) => {
    setMode(modeId, { origin: "user" });
  }, [setMode]);

  const plan = usePlanWorkflow({
    workspaceId,
    workspacePath,
    activeSessionId: activeAcpSessionId,
    acpSessionId: session.acp_session_id,
    localSessionId: session.id,
    initialPhase: session.phase,
    sessionPlanFilePath: session.plan_file_path,
    agentPlanFilePath,
    isStreaming,
    availableModes,
    sendPrompt,
    setMode,
    onPhaseChange: onPhaseChange
      ? (phase) => onPhaseChange(session.id, phase)
      : undefined,
    onAutoSwitchMode: handleAutoSwitchMode,
  });

  const handleConnect = useCallback(() => {
    initRef.current = false;
    doInitRef.current();
  }, []);

  const handleDisconnect = useCallback(async () => {
    await sessionConn.disconnect();
  }, [sessionConn]);

  const doInit = useCallback(async () => {
    try {
      const isNewSession = !session.acp_session_id;
      const provider = session.provider ?? "copilot";
      const opts: Parameters<typeof sessionConn.connect>[0] = {
        workspacePath,
        provider,
        acpSessionId: session.acp_session_id || undefined,
      };
      if (provider === "copilot") {
        const binary = localStorage.getItem("arandu-copilot-path") || undefined;
        const ghToken = localStorage.getItem("arandu-gh-token") || undefined;
        opts.binary = binary;
        opts.ghToken = ghToken;
      } else if (provider === "claude") {
        opts.binary = localStorage.getItem("arandu-claude-path") || undefined;
        opts.model = localStorage.getItem("arandu-claude-model") || undefined;
        opts.skipPermissions = localStorage.getItem("arandu-claude-skip-permissions") === "true";
        opts.maxBudgetUsd = localStorage.getItem("arandu-claude-max-budget") || undefined;
      }
      const acpId = await sessionConn.connect(opts);

      setActiveAcpSessionId(acpId);
      updateSessionEntry(session.id, { activeAcpSessionId: acpId });

      if (isNewSession) {
        await invoke("session_update_acp_id", {
          id: session.id,
          acpSessionId: acpId,
        });
      }

      if (isNewSession) {
        try {
          const raw = session.acp_preferences_json || "{}";
          const prefs: AcpPreferences = JSON.parse(raw);
          if (!prefs.modeId) {
            const defaults = await invoke<string | null>("workspace_acp_defaults_get", { workspacePath });
            if (defaults) {
              const wPrefs: AcpPreferences = JSON.parse(defaults);
              if (wPrefs.modeId) prefs.modeId = wPrefs.modeId;
              if (wPrefs.selectedConfigOptions) {
                prefs.selectedConfigOptions = { ...wPrefs.selectedConfigOptions, ...prefs.selectedConfigOptions };
              }
            }
          }
          if (prefs.selectedConfigOptions) {
            for (const [configId, optionId] of Object.entries(prefs.selectedConfigOptions)) {
              invoke("acp_session_set_config_option", { sessionId: session.id, configId, optionId }).catch(console.error);
            }
          }
        } catch { /* ignore preference errors */ }
      }

      if (session.phase === "idle") {
        const prompt = isNewSession && session.name
          ? `${session.name}\n\n${session.initial_prompt}`
          : session.initial_prompt;
        plan.startPlanning(acpId, prompt);
      }
    } catch (e) {
      console.error("[ActiveSessionView] init error:", e);
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [sessionConn, workspacePath, session.acp_session_id, session.id, session.provider, session.phase, session.initial_prompt, session.name, plan.startPlanning]);

  // Auto-init: only for new sessions (no acp_session_id yet).
  // Existing sessions require manual reconnection.
  const doInitRef = useRef(doInit);
  doInitRef.current = doInit;
  useEffect(() => {
    if (initRef.current) return;
    if (session.acp_session_id) return;
    initRef.current = true;
    doInitRef.current();
  }, [session.id, session.acp_session_id]);

  // Reset initRef only when acp_session_id transitions from set → cleared (disconnect),
  // NOT on the initial mount with null (which would cause double-init in React 18 StrictMode)
  const prevAcpIdRef = useRef(session.acp_session_id);
  useEffect(() => {
    if (prevAcpIdRef.current && !session.acp_session_id) {
      initRef.current = false;
    }
    prevAcpIdRef.current = session.acp_session_id;
  }, [session.acp_session_id]);

  const handleReconnect = useCallback(async () => {
    initRef.current = false;
    clearErrors();
    try {
      await handleDisconnect();
    } catch (e) {
      console.warn("[ActiveSessionView] disconnect during reconnection failed:", e);
    }
    await handleConnect();
  }, [handleDisconnect, handleConnect]);

  const handleRefreshInfo = useCallback(async () => {
    try {
      await invoke("acp_session_refresh_info", { sessionId: session.id });
    } catch (e) {
      console.error("[ActiveSessionView] refresh info error:", e);
    }
  }, [session.id]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleLayout = useCallback((sizes: number[]) => {
    if (!session.id || sizes[0] === 0) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`arandu-chat-panel-size-${session.id}`, String(sizes[0]));
      } catch { /* ignore */ }
    }, 500);
  }, [session.id]);

  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  const chatDefaultSize = useMemo(() => {
    try {
      const saved = localStorage.getItem(`arandu-chat-panel-size-${session.id}`);
      if (saved) return Number(saved);
    } catch { /* ignore */ }
    return 40;
  }, [session.id]);
  const planDefaultSize = useMemo(() => 100 - chatDefaultSize, [chatDefaultSize]);

  const currentPhase = plan.phase ?? session.phase;

  const handleToggleChat = useCallback(() => {
    if (chatPanelRef.current?.isCollapsed()) {
      chatPanelRef.current.expand();
    } else {
      chatPanelRef.current?.collapse();
    }
  }, []);

  const handleTogglePlan = useCallback(async () => {
    if (!plan.planFilePath) {
      const found = await plan.locatePlan();
      if (found) planPanelRef.current?.expand();
      return;
    }
    if (planPanelRef.current?.isCollapsed()) {
      planPanelRef.current.expand();
    } else {
      planPanelRef.current?.collapse();
    }
  }, [plan.planFilePath, plan.locatePlan]);

  const handlePhaseSelect = useCallback((phase: PlanPhase) => {
    plan.setPhase(phase);
    if (onPhaseChange) {
      onPhaseChange(session.id, phase);
    }
    if (session.id) {
      invoke("session_update_phase", { id: session.id, phase }).catch(console.error);
    }
  }, [plan.setPhase, onPhaseChange, session.id]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-10 border-b border-border px-3 flex items-center justify-between shrink-0 bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate mx-2">{session.name}</span>
          <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded flex-shrink-0 uppercase tracking-wider">
            {session.provider === "claude" ? t("settings.providerClaude") : t("settings.providerCopilot")}
          </span>
          <button
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground font-mono flex-shrink-0 transition-colors"
            title={session.acp_session_id ?? session.id}
            onClick={() => { void copyToClipboard(session.acp_session_id ?? session.id); }}
          >
            #{(session.acp_session_id ?? session.id).slice(0, 8)}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-muted transition-colors flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${PHASE_COLORS[currentPhase]}`} />
                <span className="text-xs text-muted-foreground">
                  {t(PHASE_KEYS[currentPhase])}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PHASES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  onClick={() => handlePhaseSelect(p)}
                  className="text-xs gap-2"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${PHASE_COLORS[p]}`} />
                  {t(PHASE_KEYS[p])}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {isConnecting ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("acp.connecting")}
            </span>
          ) : isConnected ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleDisconnect}
            >
              <Unplug className="h-3 w-3" />
              {t("acp.disconnect")}
            </Button>
          ) : session.acp_session_id ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => void handleReconnect()}
            >
              <RefreshCw className="h-3 w-3" />
              {t("acp.reconnect")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleConnect}
            >
              <Plug className="h-3 w-3" />
              {t("acp.connect")}
            </Button>
          )}
          <AcpSessionControls
            disabled={!isConnected}
            currentModeId={currentMode}
            availableModes={availableModes}
            configOptions={availableConfigOptions}
            selectedConfigOptions={selectedConfigOptions}
            onSelectMode={handleSelectMode}
            onSelectConfigOption={setConfigOption}
            onRefresh={isConnected ? handleRefreshInfo : undefined}
          />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${chatCollapsed ? "text-muted-foreground/40" : "text-muted-foreground"} hover:text-foreground`}
            onClick={handleToggleChat}
            title={t("sessions.toggleChat")}
          >
            <Bot className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${!plan.planFilePath ? "text-muted-foreground/40" : planCollapsed ? "text-muted-foreground/40" : "text-muted-foreground"} hover:text-foreground`}
            onClick={handleTogglePlan}
            title={plan.planFilePath ? t("sessions.togglePlan") : t("sessions.locatePlan")}
          >
            {plan.planFilePath ? (
              <FileText className="h-3.5 w-3.5" />
            ) : (
              <FileSearch className="h-3.5 w-3.5" />
            )}
          </Button>
          <ConnectionLogs
            logs={acpLogs.logs}
            hasRecentErrors={acpLogs.hasRecentErrors}
            onClear={acpLogs.clearLogs}
          />
          <div className="w-px h-4 bg-border mx-0.5" />
          {onMinimize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onMinimize}
              title={t("sessions.minimize")}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 min-h-0"
        onLayout={handleLayout}
      >
        <ResizablePanel
          id="session-chat"
          ref={chatPanelRef}
          className="relative"
          defaultSize={chatDefaultSize}
          minSize={25}
          collapsible
          collapsedSize={0}
          onCollapse={() => setChatCollapsed(true)}
          onExpand={() => setChatCollapsed(false)}
        >
          <div className="absolute inset-0">
            <TerminalChat
              messages={sessionMessages.messages}
              errors={errors}
              isStreaming={isStreaming}
              onSend={sendPrompt}
              onCancel={cancel}
              onClearErrors={clearErrors}
              onClearHistory={handleClearHistory}
              disabled={!isConnected}
              initialPrompt={session.initial_prompt || undefined}
              onLoadMore={sessionMessages.hasMore ? sessionMessages.loadMore : undefined}
              hasMore={sessionMessages.hasMore}
              isLoadingMore={sessionMessages.isLoadingMore}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel
          id="session-plan"
          ref={planPanelRef}
          className="relative"
          defaultSize={planDefaultSize}
          minSize={20}
          collapsible
          collapsedSize={0}
          onCollapse={() => setPlanCollapsed(true)}
          onExpand={() => setPlanCollapsed(false)}
        >
          <div className="absolute inset-0">
            <MarkdownViewer
              filePath={plan.planFilePath ?? undefined}
              embedded
              phase={plan.phase}
              onApprovePlan={plan.approvePlan}
              onRequestChanges={plan.requestChanges}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
