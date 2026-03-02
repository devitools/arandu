import { useState, useCallback, useRef } from "react";
import type { PlanPhase } from "@/types";
import { Loader2, Minimize2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Trans, useTranslation } from "react-i18next";
import { shortenPath } from "@/lib/format-path";
import { useApp } from "@/contexts/AppContext";
import { NewSessionForm } from "./NewSessionForm";
import { ActiveSessionView } from "./ActiveSessionView";
import { SessionCard } from "./SessionCard";
import { useLocalSessions } from "@/hooks/useLocalSessions";
import { useAcpConnection } from "@/hooks/useAcpConnection";
import type { SessionRecord } from "@/types";

export function DirectoryWorkspace() {
  const { t } = useTranslation();
  const { workspaces, expandedWorkspaceId, minimizeWorkspace, closeWorkspace } = useApp();
  const workspace = workspaces.find((w) => w.id === expandedWorkspaceId);

  const [showNewForm, setShowNewForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [browsing, setBrowsing] = useState(true);
  const mountedSessionRef = useRef<SessionRecord | null>(null);

  const local = useLocalSessions(workspace?.path ?? "");
  const connection = useAcpConnection(workspace?.id ?? "", workspace?.path ?? "");

  const mountedSession = mountedSessionRef.current
    ? local.sessions.find((s) => s.id === mountedSessionRef.current!.id) ?? mountedSessionRef.current
    : null;

  const handleNewSession = useCallback(
    async (name: string, prompt: string) => {
      setIsCreating(true);
      try {
        if (!connection.isConnected) {
          await connection.connect();
        }
        const record = await local.createSession(name, prompt);
        mountedSessionRef.current = record;
        setBrowsing(false);
        setShowNewForm(false);
      } catch (e) {
        console.error("[DirectoryWorkspace] create session error:", e);
      } finally {
        setIsCreating(false);
      }
    },
    [connection, local]
  );

  const handleResumeSession = useCallback(
    async (session: SessionRecord) => {
      if (!connection.isConnected) {
        await connection.connect();
      }
      mountedSessionRef.current = session;
      setBrowsing(false);
    },
    [connection]
  );

  const handlePhaseChange = useCallback(
    (sessionId: string, phase: PlanPhase) => {
      local.updateSessionLocal(sessionId, { phase });
    },
    [local]
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (mountedSessionRef.current?.id === id) {
        mountedSessionRef.current = null;
        setBrowsing(true);
      }
      await local.deleteSession(id);
    },
    [local]
  );

  const handleBackToSessions = useCallback(() => {
    setBrowsing(true);
  }, []);

  const handleReconnect = useCallback(async () => {
    await connection.disconnect();
    await connection.connect();
  }, [connection]);

  if (!workspace) return null;

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="h-12 border-b border-border px-4 flex items-center justify-between shrink-0" data-tauri-drag-region>
        <div className="flex items-center gap-3 min-w-0" data-tauri-drag-region="false">
          <h2 className="font-semibold text-sm">{workspace.displayName}</h2>
          <span className="text-xs text-muted-foreground truncate" dir="rtl" title={workspace.path}>
            <bdi>{shortenPath(workspace.path)}</bdi>
          </span>
          {connection.isConnecting && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("acp.connecting")}
            </span>
          )}
          {connection.connectionError && (
            <span className="text-xs text-destructive truncate max-w-[200px]" title={connection.connectionError}>
              {connection.connectionError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" data-tauri-drag-region="false">
          {browsing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNewForm(true)}
              className="h-8 w-8"
              title={t("sessions.newSession")}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={minimizeWorkspace} className="h-8 w-8" title={t("common.minimize")}>
            <Minimize2 className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                title={t("common.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("workspace.closeTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans
                    i18nKey="workspace.closeDescription"
                    values={{ name: workspace.displayName }}
                    components={{ strong: <strong /> }}
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    await connection.disconnect();
                    closeWorkspace(workspace.id);
                  }}
                >
                  {t("common.close")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {mountedSession && (
          <div className={browsing ? "hidden" : "flex-1 flex overflow-hidden min-h-0"}>
            <ActiveSessionView
              key={mountedSession.id}
              workspaceId={workspace.id}
              workspacePath={workspace.path}
              session={mountedSession}
              isConnected={connection.isConnected}
              onPhaseChange={handlePhaseChange}
              onReconnect={handleReconnect}
              onMinimize={handleBackToSessions}
              onEnd={async () => {
                await connection.disconnect();
                mountedSessionRef.current = null;
                setBrowsing(true);
              }}
            />
          </div>
        )}

        {browsing && (
          <div className="flex-1 flex flex-col">
            {local.loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : local.sessions.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-muted-foreground/50 font-mono text-sm">
                    {t("sessions.emptyWorkspace")}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewForm(true)}
                  >
                    {t("sessions.newSession")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-2">
                  {local.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onSelect={handleResumeSession}
                      onDelete={handleDeleteSession}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <NewSessionForm
        open={showNewForm}
        onOpenChange={setShowNewForm}
        onSubmit={handleNewSession}
        isLoading={isCreating}
      />
    </div>
  );
}
