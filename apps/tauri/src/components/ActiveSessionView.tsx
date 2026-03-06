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
import { subscribeSession, updateSessionEntry } from "@/lib/session-cache";
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
import { AlertCircle, FileText, Loader2, MessageSquare, Minimize2, Plug, Unplug, RefreshCw } from "lucide-react";
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
  /** @deprecated Use internal useSessionConnection(session.id) instead */
  isConnected?: boolean;
  /** @deprecated */
  isConnecting?: boolean;
  onPhaseChange?: (sessionId: string, phase: PlanPhase) => void;
  /** @deprecated */
  onConnect?: () => Promise<void>;
  /** @deprecated */
  onDisconnect?: () => Promise<void>;
  onMinimize?: () => void;
}

export function ActiveSessionView({
  workspaceId,
  workspacePath,
  session,
  isConnected: isConnectedProp,
  isConnecting: isConnectingProp,
  onPhaseChange,
  onConnect,
  onDisconnect,
  onMinimize,
}: ActiveSessionViewProps) {
  const initRef = useRef(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const planPanelRef = useRef<ImperativePanelHandle>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Per-session connection (new architecture)
  const sessionConn = useSessionConnection(session.id);
  // Per-session messages loaded from SQLite (new architecture)
  const sessionMessages = useSessionMessages(session.id);

  // Resolved connection state (new arch takes precedence over legacy props)
  const isConnected = sessionConn.status !== "idle" ? sessionConn.isConnected : (isConnectedProp ?? false);
  const isConnecting = sessionConn.isConnecting || (isConnectingProp ?? false);

  // Streaming state from session-cache (new arch events keyed by session.id)
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [availableModes, setAvailableModes] = useState<string[]>([]);
  const [agentPlanFilePath, setAgentPlanFilePath] = useState<string | null>(null);
  const [activeAcpSessionId, setActiveAcpSessionId] = useState<string | null>(
    session.acp_session_id ?? null
  );
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const unsub = subscribeSession(session.id, (entry) => {
      setCurrentMode(entry.currentMode);
      setAvailableModes(entry.availableModes);
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
    sessionMessages.addOptimisticMessage(text);
    try {
      await invoke("acp_session_send_prompt", { sessionId: session.id, text });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
      updateSessionEntry(session.id, { isStreaming: false });
    }
  }, [session.id, sessionMessages]);

  const setMode = useCallback(async (mode: string) => {
    try {
      await invoke("acp_session_set_mode", { sessionId: session.id, mode });
      updateSessionEntry(session.id, { currentMode: mode });
    } catch (e) {
      setErrors((prev) => [...prev, String(e)]);
    }
  }, [session.id]);

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
  });

  const handleConnect = useCallback(async () => {
    initRef.current = false;
    if (onConnect) {
      await onConnect();
    } else {
      doInitRef.current();
    }
  }, [onConnect]);

  const handleDisconnect = useCallback(async () => {
    if (onDisconnect) {
      await onDisconnect();
    } else {
      await sessionConn.disconnect();
    }
  }, [onDisconnect, sessionConn]);

  const doInit = useCallback(async () => {
    setInitError(null);
    try {
      const isNewSession = !session.acp_session_id;
      // acp_session_connect handles both new and resume cases
      const acpId = await sessionConn.connect(
        workspacePath,
        undefined,
        undefined,
        session.acp_session_id || undefined
      );
      if (!acpId) throw new Error("Failed to connect to ACP");

      setActiveAcpSessionId(acpId);
      updateSessionEntry(session.id, { activeAcpSessionId: acpId });

      if (isNewSession) {
        await invoke("session_update_acp_id", {
          id: session.id,
          acpSessionId: acpId,
        });
      }

      if (session.phase === "idle") {
        const prompt = isNewSession && session.name
          ? `${session.name}\n\n${session.initial_prompt}`
          : session.initial_prompt;
        plan.startPlanning(acpId, prompt);
      }
    } catch (e) {
      console.error("[ActiveSessionView] init error:", e);
      setInitError(String(e));
    }
  }, [sessionConn, workspacePath, session.acp_session_id, session.id, session.phase, session.initial_prompt, session.name, plan.startPlanning]);

  // Auto-init: connect + send initial prompt on mount (or when session changes)
  const doInitRef = useRef(doInit);
  doInitRef.current = doInit;
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    doInitRef.current();
  }, [session.id]); // run once per session

  // Reset initRef when session ACP id is cleared (allows re-init on reconnect)
  useEffect(() => {
    if (!session.acp_session_id) initRef.current = false;
  }, [session.acp_session_id]);

  const handleReconnect = useCallback(async () => {
    initRef.current = false;
    setInitError(null);
    try {
      await handleDisconnect();
    } catch (e) {
      console.warn("[ActiveSessionView] disconnect during reconnect failed:", e);
    }
    await handleConnect();
  }, [handleDisconnect, handleConnect]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleLayout = useCallback((sizes: number[]) => {
    if (!session.id || sizes[0] === 0) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      invoke("session_update_chat_panel_size", { id: session.id, size: sizes[0] }).catch(console.error);
    }, 500);
  }, [session.id]);

  useEffect(() => {
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  const chatDefaultSize = useMemo(() => session.chat_panel_size ?? 40, [session.id]);
  const planDefaultSize = useMemo(() => {
    if (session.chat_panel_size != null) return 100 - session.chat_panel_size;
    return 60;
  }, [session.id]);

  const { t } = useTranslation();
  const currentPhase = plan.phase ?? session.phase;

  const handleToggleChat = useCallback(() => {
    if (chatPanelRef.current?.isCollapsed()) {
      chatPanelRef.current.expand();
    } else {
      chatPanelRef.current?.collapse();
    }
  }, []);

  const handleTogglePlan = useCallback(() => {
    if (planPanelRef.current?.isCollapsed()) {
      planPanelRef.current.expand();
    } else {
      planPanelRef.current?.collapse();
    }
  }, []);

  const handlePhaseSelect = useCallback((phase: PlanPhase) => {
    plan.setPhase(phase);
    if (onPhaseChange) {
      onPhaseChange(session.id, phase);
    }
    if (session.id) {
      invoke("session_update_phase", { id: session.id, phase }).catch(console.error);
    }
  }, [plan.setPhase, onPhaseChange, session.id]);

  if (initError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground text-center max-w-md">{initError}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReconnect}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("acp.reconnect")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-10 border-b border-border px-3 flex items-center justify-between shrink-0 bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate mx-2">{session.name}</span>
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
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${chatCollapsed ? "text-muted-foreground/40" : "text-muted-foreground"} hover:text-foreground`}
            onClick={handleToggleChat}
            title={t("sessions.toggleChat")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
          {plan.planFilePath && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${planCollapsed ? "text-muted-foreground/40" : "text-muted-foreground"} hover:text-foreground`}
              onClick={handleTogglePlan}
              title={t("sessions.togglePlan")}
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
          )}
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
