import logoSvg from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { FileText, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceCard } from "./WorkspaceCard";

const { invoke } = window.__TAURI__.core;

export function HomeScreen () {
  const { t } = useTranslation();
  const { workspaces, openFile, openDirectory, expandWorkspace, closeWorkspace } = useApp();
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});

  const byRecent = (a: { lastAccessed: Date }, b: { lastAccessed: Date }) =>
    new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime();

  const fileWorkspaces = workspaces.filter((w) => w.type === "file").sort(byRecent);
  const dirWorkspaces = workspaces.filter((w) => w.type === "directory").sort(byRecent);

  const fetchCommentCounts = useCallback(async () => {
    if (fileWorkspaces.length === 0) return;
    const paths = fileWorkspaces.map((w) => w.path);
    try {
      const results = await invoke<[string, number][]>("count_unresolved_comments", { filePaths: paths });
      const counts: Record<string, number> = {};
      for (const [path, count] of results) {
        counts[path] = count;
      }
      setCommentCounts(counts);
    } catch {
      // silently ignore
    }
  }, [fileWorkspaces.map((w) => w.path).join(",")]);

  const fetchSessionCounts = useCallback(async () => {
    if (dirWorkspaces.length === 0) return;
    const paths = dirWorkspaces.map((w) => w.path);
    try {
      const results = await invoke<[string, number][]>("count_workspace_sessions", { workspacePaths: paths });
      const counts: Record<string, number> = {};
      for (const [path, count] of results) {
        counts[path] = count;
      }
      setSessionCounts(counts);
    } catch {
      // silently ignore
    }
  }, [dirWorkspaces.map((w) => w.path).join(",")]);

  useEffect(() => {
    fetchCommentCounts();
  }, [fetchCommentCounts]);

  useEffect(() => {
    fetchSessionCounts();
  }, [fetchSessionCounts]);

  const handleOpenFile = () => openFile();
  const handleOpenDirectory = () => openDirectory();

  return (
    <div className={`home-screen flex-1 flex flex-col items-center overflow-y-auto p-5 bg-background ${workspaces.length === 0 ? "justify-center" : ""}`}>
      {workspaces.length === 0 ? (
        <div className="text-center max-w-md">
          <div className="mb-8">
            <img
              src={logoSvg}
              alt="Arandu Logo"
              className="w-16 h-16 rounded-xl mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold mb-2">Arandu</h1>
            <p className="text-muted-foreground">{t("home.tagline")}</p>
          </div>

          <div className="flex flex-col gap-3 mt-8">
            <Button
              size="lg"
              variant="ghost"
              className="w-full justify-start gap-3 h-14 border border-border hover:bg-accent hover:border-foreground/20 group"
              onClick={handleOpenDirectory}
            >
              <div className="w-10 h-10 rounded-lg bg-muted group-hover:bg-accent flex items-center justify-center transition-colors">
                <FolderOpen className="h-5 w-5 text-foreground" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold">{t("home.openDirectory")}</div>
                <div className="text-xs text-muted-foreground group-hover:text-foreground/90">{t("home.openDirectoryDescription")}</div>
              </div>
            </Button>

            <Button
              size="lg"
              variant="ghost"
              className="w-full justify-start gap-3 h-14 border border-border hover:bg-accent hover:border-foreground/20 group"
              onClick={handleOpenFile}
            >
              <div className="w-10 h-10 rounded-lg bg-muted group-hover:bg-accent flex items-center justify-center transition-colors">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold">{t("home.openFile")}</div>
                <div className="text-xs text-muted-foreground group-hover:text-foreground/90">{t("home.openFileDescription")}</div>
              </div>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            {t("home.hint")}
          </p>
        </div>
      ) : (
        <div className="w-full space-y-5">
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleOpenFile}
            >
              <FileText className="h-4 w-4" />
              {t("home.openFile")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleOpenDirectory}
            >
              <FolderOpen className="h-4 w-4" />
              {t("home.openDirectory")}
            </Button>
          </div>

          {/* Documents Section */}
          {fileWorkspaces.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("home.documents")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-2">
                {fileWorkspaces.map((workspace) => (
                    <WorkspaceCard
                      key={workspace.id}
                      workspace={workspace}
                      unresolvedComments={commentCounts[workspace.path]}
                      onExpand={expandWorkspace}
                      onClose={closeWorkspace}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Workspaces Section */}
          {dirWorkspaces.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t("home.workspaces")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-2">
                {dirWorkspaces.map((workspace) => (
                    <WorkspaceCard
                      key={workspace.id}
                      workspace={workspace}
                      sessionCount={sessionCounts[workspace.path]}
                      onExpand={expandWorkspace}
                      onClose={closeWorkspace}
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
