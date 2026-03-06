import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { TerminalChat } from "./TerminalChat";
import { MarkdownViewer } from "./MarkdownViewer";
import { useAcpSession } from "@/hooks/useAcpSession";
import { useAcpLogs } from "@/hooks/useAcpLogs";
import { usePlanWorkflow } from "@/hooks/usePlanWorkflow";
import { ConnectionLogs } from "@/components/ConnectionLogs";
import { AcpSessionControls } from "@/components/AcpSessionControls";
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
  isConnected: boolean;
  isConnecting?: boolean;
  onPhaseChange?: (sessionId: string, phase: PlanPhase) => void;
  onConnect?: () => Promise<void>;
  onDisconnect?: () => Promise<void>;
  onMinimize?: () => void;
}

export function ActiveSessionView({
  workspaceId,
  workspacePath,
  session,
  isConnected,
  isConnecting,
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
  const { t } = useTranslation();

  const acp = useAcpSession(workspaceId, workspacePath, session.id, isConnected);
  const acpLogs = useAcpLogs(workspaceId);

  const getModeLabel = useCallback((modeId: string) => {
    const mode = acp.availableModes.find((m) => m.id === modeId);
    if (mode?.name?.trim()) return mode.name;

    const slug = (modeId.split("#").pop() ?? modeId.split("/").pop() ?? modeId).toLowerCase();
    switch (slug) {
      case "ask":
        return t("acp.modeAsk");
      case "plan":
        return t("acp.modePlan");
      case "code":
        return t("acp.modeCode");
      case "autopilot":
        return t("acp.modeAutopilot");
      case "agent":
        return t("acp.modeAgent");
      case "edit":
        return t("acp.modeEdit");
      default:
        return modeId;
    }
  }, [acp.availableModes, t]);

  const handleAutoSwitchMode = useCallback((modeId: string) => {
    acp.appendNotice(t("acp.autoSwitchNotice", { mode: getModeLabel(modeId) }));
  }, [acp.appendNotice, getModeLabel, t]);

  const plan = usePlanWorkflow({
    workspaceId,
    activeSessionId: acp.activeAcpSessionId,
    acpSessionId: session.acp_session_id,
    localSessionId: session.id,
    initialPhase: session.phase,
    sessionPlanFilePath: session.plan_file_path,
    agentPlanFilePath: acp.agentPlanFilePath,
    isStreaming: acp.isStreaming,
    availableModes: acp.availableModes,
    sendPrompt: acp.sendPrompt,
    setMode: acp.setMode,
    onAutoSwitchMode: handleAutoSwitchMode,
    onPhaseChange: onPhaseChange
      ? (phase) => onPhaseChange(session.id, phase)
      : undefined,
  });

  const doInit = useCallback(async () => {
    setInitError(null);
    try {
      const isNewSession = !session.acp_session_id;
      let acpId: string;
      if (!isNewSession) {
        acpId = await acp.startSession(session.acp_session_id);
      } else {
        acpId = await acp.startSession();
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
  }, [isConnected, session.acp_session_id, session.id, session.phase, session.initial_prompt, session.name, acp.startSession, plan.startPlanning]);

  useEffect(() => {
    initRef.current = false;
  }, [session.id, session.acp_session_id]);

  useEffect(() => {
    if (!isConnected) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    doInit();
  }, [isConnected, session.id, session.acp_session_id]);

  const handleReconnect = useCallback(async () => {
    initRef.current = false;
    setInitError(null);
    try {
      if (onDisconnect) await onDisconnect();
    } catch (e) {
      console.warn("[ActiveSessionView] disconnect during reconnect failed:", e);
    }
    if (onConnect) await onConnect();
  }, [onDisconnect, onConnect]);

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
            onClick={() => navigator.clipboard.writeText(session.acp_session_id ?? session.id)}
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
          <AcpSessionControls
            disabled={!isConnected || acp.isStreaming}
            currentModeId={acp.currentMode}
            availableModes={acp.availableModes}
            configOptions={acp.availableConfigOptions}
            selectedConfigOptions={acp.selectedConfigOptions}
            onSelectMode={(modeId) => {
              void acp.setMode(modeId, { origin: "user" });
            }}
            onSelectConfigOption={(configId, optionId) => {
              void acp.setConfigOption(configId, optionId);
            }}
          />
          {isConnecting ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("acp.connecting")}
            </span>
          ) : isConnected && onDisconnect ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onDisconnect}
            >
              <Unplug className="h-3 w-3" />
              {t("acp.disconnect")}
            </Button>
          ) : !isConnected && onConnect ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onConnect}
            >
              <Plug className="h-3 w-3" />
              {t("acp.connect")}
            </Button>
          ) : null}
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
              messages={acp.messages}
              errors={acp.errors}
              isStreaming={acp.isStreaming}
              onSend={acp.sendPrompt}
              onCancel={acp.cancel}
              onClearErrors={acp.clearErrors}
              disabled={!isConnected}
              initialPrompt={session.initial_prompt || undefined}
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
