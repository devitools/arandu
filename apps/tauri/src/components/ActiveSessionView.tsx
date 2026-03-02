import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { TerminalChat } from "./TerminalChat";
import { MarkdownViewer } from "./MarkdownViewer";
import { useAcpSession } from "@/hooks/useAcpSession";
import { usePlanWorkflow } from "@/hooks/usePlanWorkflow";
import type { SessionRecord, PlanPhase } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, FileText, Loader2, MessageSquare, Minimize2, Plug, RefreshCw, X } from "lucide-react";
import { Trans } from "react-i18next";
import type { ImperativePanelHandle } from "react-resizable-panels";

const PHASES: PlanPhase[] = ["idle", "planning", "reviewing", "executing", "done"];

const PHASE_COLORS: Record<PlanPhase, string> = {
  idle: "bg-muted-foreground/30",
  planning: "bg-yellow-500",
  reviewing: "bg-blue-500",
  executing: "bg-green-500",
  done: "bg-emerald-500",
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
  onReconnect?: () => Promise<void>;
  onMinimize?: () => void;
  onEnd?: () => void;
}

export function ActiveSessionView({
  workspaceId,
  workspacePath,
  session,
  isConnected,
  isConnecting,
  onPhaseChange,
  onConnect,
  onReconnect,
  onMinimize,
  onEnd,
}: ActiveSessionViewProps) {
  const initRef = useRef(false);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const planPanelRef = useRef<ImperativePanelHandle>(null);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const acp = useAcpSession(workspaceId, workspacePath, isConnected);

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
    onPhaseChange: onPhaseChange
      ? (phase) => onPhaseChange(session.id, phase)
      : undefined,
  });

  const doInit = useCallback(async () => {
    setInitError(null);
    try {
      let acpId: string;
      if (session.acp_session_id) {
        acpId = await acp.startSession(session.acp_session_id);
      } else {
        acpId = await acp.startSession();
        await invoke("session_update_acp_id", {
          id: session.id,
          acpSessionId: acpId,
        });
      }

      if (session.phase === "idle") {
        plan.startPlanning(acpId, session.initial_prompt);
      }
    } catch (e) {
      console.error("[ActiveSessionView] init error:", e);
      setInitError(String(e));
    }
  }, [isConnected, session.acp_session_id, session.id, session.phase, session.initial_prompt, acp.startSession, plan.startPlanning]);

  useEffect(() => {
    if (!isConnected || initRef.current) return;
    initRef.current = true;
    doInit();
  }, [isConnected]);

  const handleReconnect = useCallback(async () => {
    initRef.current = false;
    setInitError(null);
    if (onReconnect) {
      await onReconnect();
    }
  }, [onReconnect]);

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
          {!isConnected && !isConnecting && onConnect && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onConnect}
            >
              <Plug className="h-3 w-3" />
              {t("acp.connect")}
            </Button>
          )}
          {isConnecting && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("acp.connecting")}
            </span>
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
          {onEnd && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title={t("sessions.endSession")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("sessions.endSessionTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    <Trans
                      i18nKey="sessions.endSessionDescription"
                      values={{ name: session.name }}
                      components={{ strong: <strong /> }}
                    />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={onEnd}>
                    {t("sessions.endSession")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 min-h-0"
      >
        <ResizablePanel
          id="session-chat"
          ref={chatPanelRef}
          className="relative"
          defaultSize={40}
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
              onReconnect={handleReconnect}
              initialPrompt={session.initial_prompt || undefined}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel
          id="session-plan"
          ref={planPanelRef}
          className="relative"
          defaultSize={60}
          minSize={30}
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
