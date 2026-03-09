import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Workspace, CardRect } from '@/types';
import { clearWorkspaceCaches } from '@/lib/session-cache';

const { invoke } = window.__TAURI__.core;
const { open: openDialog } = window.__TAURI__.dialog;

interface WorkspaceRecord {
  id: string;
  path: string;
  display_name: string;
  workspace_type: string;
  last_accessed: number;
  created_at: number;
}

function recordToWorkspace(r: WorkspaceRecord): Workspace {
  return {
    id: r.id,
    type: r.workspace_type as "file" | "directory",
    path: r.path,
    displayName: r.display_name,
    lastAccessed: new Date(r.last_accessed * 1000),
  };
}

export const ANIMATION_DURATION = 380;

interface AppContextValue {
  view: 'home' | 'file-expanded' | 'directory-expanded';
  workspaces: Workspace[];
  expandedWorkspaceId: string | null;
  persistedWorkspaceId: string | null;
  isMinimizing: boolean;
  isExpanding: boolean;
  cardRect: CardRect | null;

  openFile: (path?: string) => void;
  openDirectory: (path?: string) => void;
  expandWorkspace: (id: string, rect?: CardRect) => void;
  minimizeWorkspace: () => void;
  closeWorkspace: (id: string) => void;
  forgetWorkspace: (id: string) => Promise<void>;
  finishExpand: () => void;
  finishMinimize: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<'home' | 'file-expanded' | 'directory-expanded'>('home');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [persistedWorkspaceId, setPersistedWorkspaceId] = useState<string | null>(null);
  const [isExpanding, setIsExpanding] = useState(false);
  const [cardRect, setCardRect] = useState<CardRect | null>(null);

  // Load workspaces from SQLite on mount
  useEffect(() => {
    invoke<WorkspaceRecord[]>('workspace_list')
      .then((records) => setWorkspaces(records.map(recordToWorkspace)))
      .catch(console.error);
  }, []);

  const openFile = useCallback(async (path?: string) => {
    let filePath = path;
    if (!filePath) {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      });
      if (!selected) return;
      filePath = selected as string;
    }

    const existing = workspaces.find((w) => w.type === 'file' && w.path === filePath);
    if (existing) {
      invoke('workspace_touch', { id: existing.id }).catch(console.error);
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === existing.id ? { ...w, lastAccessed: new Date() } : w))
      );
      setExpandedWorkspaceId(existing.id);
      setView('file-expanded');
      return;
    }

    const id = `file-${Date.now()}`;
    const displayName = filePath.split('/').pop() || filePath;
    const record = await invoke<WorkspaceRecord>('workspace_upsert', {
      id,
      path: filePath,
      displayName,
      workspaceType: 'file',
    });
    const newWorkspace = recordToWorkspace(record);
    setWorkspaces((prev) => [newWorkspace, ...prev]);
    setExpandedWorkspaceId(newWorkspace.id);
    setView('file-expanded');
  }, [workspaces]);

  const openDirectory = useCallback(async (path?: string) => {
    let dirPath = path;
    if (!dirPath) {
      const selected = await openDialog({
        directory: true,
        multiple: false,
      });
      if (!selected) return;
      dirPath = selected as string;
    }

    const existing = workspaces.find((w) => w.type === 'directory' && w.path === dirPath);
    if (existing) {
      invoke('workspace_touch', { id: existing.id }).catch(console.error);
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === existing.id ? { ...w, lastAccessed: new Date() } : w))
      );
      setExpandedWorkspaceId(existing.id);
      setPersistedWorkspaceId(existing.id);
      setView('directory-expanded');
      return;
    }

    const id = `dir-${Date.now()}`;
    const displayName = dirPath.split('/').pop() || dirPath;
    const record = await invoke<WorkspaceRecord>('workspace_upsert', {
      id,
      path: dirPath,
      displayName,
      workspaceType: 'directory',
    });
    const newWorkspace = recordToWorkspace(record);
    setWorkspaces((prev) => [newWorkspace, ...prev]);
    setExpandedWorkspaceId(newWorkspace.id);
    setPersistedWorkspaceId(newWorkspace.id);
    setView('directory-expanded');
  }, [workspaces]);

  const expandWorkspace = useCallback((id: string, rect?: CardRect) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (!workspace) return;

    invoke('workspace_touch', { id }).catch(console.error);
    if (rect) {
      setCardRect(rect);
      setIsExpanding(true);
    }
    setExpandedWorkspaceId(id);
    if (workspace.type === 'directory') {
      setPersistedWorkspaceId(id);
    }
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, lastAccessed: new Date() } : w))
    );
    setView(workspace.type === 'file' ? 'file-expanded' : 'directory-expanded');
  }, [workspaces]);

  const finishExpand = useCallback(() => {
    setIsExpanding(false);
  }, []);

  const minimizeWorkspace = useCallback(() => {
    setIsMinimizing(true);
  }, []);

  const finishMinimize = useCallback(() => {
    setIsMinimizing(false);
    if (expandedWorkspaceId) {
      invoke('workspace_touch', { id: expandedWorkspaceId }).catch(console.error);
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === expandedWorkspaceId ? { ...w, lastAccessed: new Date() } : w))
      );
    }
    setExpandedWorkspaceId(null);
    setView('home');
  }, [expandedWorkspaceId]);

  const closeWorkspace = useCallback((id: string) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (workspace?.type === 'file') {
      invoke('unwatch_file', { path: workspace.path }).catch(console.error);
    }
    if (workspace?.type === 'directory') {
      invoke('acp_disconnect', { workspaceId: id }).catch(console.error);
      clearWorkspaceCaches(id);
    }
    invoke('workspace_delete', { id }).catch(console.error);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    if (persistedWorkspaceId === id) setPersistedWorkspaceId(null);
    if (expandedWorkspaceId === id) {
      setExpandedWorkspaceId(null);
      setView('home');
    }
  }, [expandedWorkspaceId, persistedWorkspaceId, workspaces]);

  const forgetWorkspace = useCallback(async (id: string) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (!workspace) return;

    await invoke('forget_workspace_data', {
      workspaceId: workspace.id,
      workspacePath: workspace.path,
      workspaceType: workspace.type,
    });

    if (workspace.type === 'file') {
      invoke('unwatch_file', { path: workspace.path }).catch(console.error);
    }
    if (workspace.type === 'directory') {
      invoke('acp_disconnect', { workspaceId: id }).catch(console.error);
      clearWorkspaceCaches(id);
    }

    invoke('workspace_delete', { id }).catch(console.error);
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    if (persistedWorkspaceId === id) setPersistedWorkspaceId(null);
    if (expandedWorkspaceId === id) {
      setExpandedWorkspaceId(null);
      setView('home');
    }
  }, [expandedWorkspaceId, persistedWorkspaceId, workspaces]);

  const value: AppContextValue = {
    view,
    workspaces,
    expandedWorkspaceId,
    persistedWorkspaceId,
    isMinimizing,
    isExpanding,
    cardRect,
    openFile,
    openDirectory,
    expandWorkspace,
    minimizeWorkspace,
    closeWorkspace,
    forgetWorkspace,
    finishExpand,
    finishMinimize,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
