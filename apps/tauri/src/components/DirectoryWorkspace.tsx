import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PlanPhase } from "@/types";
import { Loader2, Minimize2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { shortenPath } from "@/lib/format-path";
import { useApp } from "@/contexts/AppContext";
import { NewSessionForm } from "./NewSessionForm";
import { ActiveSessionView } from "./ActiveSessionView";
import { SessionCard } from "./SessionCard";
import { useLocalSessions } from "@/hooks/useLocalSessions";
import { uiStore } from "@/lib/session-cache";
import type { SessionRecord } from "@/types";

export function DirectoryWorkspace() {
  const { t } = useTranslation();
  const { workspaces, expandedWorkspaceId, persistedWorkspaceId, minimizeWorkspace } = useApp();
  const workspace = workspaces.find((w) => w.id === (expandedWorkspaceId ?? persistedWorkspaceId));

  const cachedMountedSessionId = workspace ? uiStore.get(workspace.id)?.mountedSessionId ?? null : null;

  const [showNewForm, setShowNewForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [browsing, setBrowsing] = useState(true);
  const mountedSessionRef = useRef<SessionRecord | null>(null);

  const local = useLocalSessions(workspace?.id ?? "");

  // Track which sessions have active backend ACP instances
  const [connectedSessions, setConnectedSessions] = useState<Set<string>>(new Set());

  // Hydrate connection status from backend on mount and on workspace change
  useEffect(() => {
    invoke<string[]>("acp_session_list_active")
      .then((ids) => setConnectedSessions(new Set(ids)))
      .catch(() => {});
  }, [workspace?.id]);

  // Listen to per-session status events
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    window.__TAURI__.event
      .listen<{ sessionId: string; status: string }>("acp:session-status", (event) => {
        const { sessionId, status } = event.payload;
        setConnectedSessions((prev) => {
          const next = new Set(prev);
          if (status === "connected") next.add(sessionId);
          else next.delete(sessionId);
          return next;
        });
      })
      .then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    if (cachedMountedSessionId && !mountedSessionRef.current && !local.loading && local.sessions.length > 0) {
      const session = local.sessions.find((s) => s.id === cachedMountedSessionId);
      if (session) {
        mountedSessionRef.current = session;
        setBrowsing(false);
      }
    }
  }, [cachedMountedSessionId, local.sessions, local.loading]);

  useEffect(() => {
    return () => {
      if (workspace?.id) {
        uiStore.set(workspace.id, {
          mountedSessionId: mountedSessionRef.current?.id ?? null,
        });
      }
    };
  }, [workspace?.id]);

  const mountedSession = mountedSessionRef.current
    ? local.sessions.find((s) => s.id === mountedSessionRef.current!.id) ?? mountedSessionRef.current
    : null;

  const handleNewSession = useCallback(
    async (name: string, prompt: string, provider: string) => {
      if (!workspace) return;
      setIsCreating(true);
      try {
        const record = await local.createSession(name, prompt, provider);
        mountedSessionRef.current = record;
        setBrowsing(false);
        setShowNewForm(false);
      } catch (e) {
        console.error("[DirectoryWorkspace] create session error:", e);
      } finally {
        setIsCreating(false);
      }
    },
    [workspace, local]
  );

  const handleResumeSession = useCallback(
    (session: SessionRecord) => {
      mountedSessionRef.current = session;
      setBrowsing(false);
    },
    []
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

  if (!workspace) return null;

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      <div className="h-12 border-b border-border px-4 flex items-center justify-between shrink-0" data-tauri-drag-region>
        <div className="flex items-center gap-3 min-w-0" data-tauri-drag-region="false">
          <h2 className="font-semibold text-sm">{workspace.displayName}</h2>
          <span className="text-xs text-muted-foreground truncate" dir="rtl" title={workspace.path}>
            <bdi>{shortenPath(workspace.path)}</bdi>
          </span>
          {false && browsing && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("acp.connecting")}
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
              onPhaseChange={handlePhaseChange}
              onMinimize={handleBackToSessions}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {local.sessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onSelect={handleResumeSession}
                      onDelete={handleDeleteSession}
                      connectionStatus={connectedSessions.has(session.id) ? "connected" : "idle"}
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
