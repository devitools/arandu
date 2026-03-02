import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Workspace, CardRect } from '@/types';

const { invoke } = window.__TAURI__.core;
const { open: openDialog } = window.__TAURI__.dialog;

const WORKSPACES_STORAGE_KEY = 'arandu:workspaces';

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Workspace[];
    return parsed.map((w) => ({ ...w, lastAccessed: new Date(w.lastAccessed) }));
  } catch {
    return [];
  }
}

function saveWorkspaces(workspaces: Workspace[]) {
  localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
}

export const ANIMATION_DURATION = 350;

interface AppContextValue {
  view: 'home' | 'file-expanded' | 'directory-expanded';
  workspaces: Workspace[];
  expandedWorkspaceId: string | null;
  isMinimizing: boolean;
  isExpanding: boolean;
  cardRect: CardRect | null;

  openFile: (path?: string) => void;
  openDirectory: (path?: string) => void;
  expandWorkspace: (id: string, rect?: CardRect) => void;
  minimizeWorkspace: () => void;
  closeWorkspace: (id: string) => void;
  finishExpand: () => void;
  finishMinimize: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<'home' | 'file-expanded' | 'directory-expanded'>('home');
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null);
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [cardRect, setCardRect] = useState<CardRect | null>(null);

  useEffect(() => {
    saveWorkspaces(workspaces);
  }, [workspaces]);

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
      setExpandedWorkspaceId(existing.id);
      setView('file-expanded');
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === existing.id ? { ...w, lastAccessed: new Date() } : w))
      );
      return;
    }

    const id = `file-${Date.now()}`;
    const newWorkspace: Workspace = {
      id,
      type: 'file',
      path: filePath,
      displayName: filePath.split('/').pop() || filePath,
      lastAccessed: new Date(),
    };
    setWorkspaces((prev) => [...prev, newWorkspace]);
    setExpandedWorkspaceId(id);
    setView('file-expanded');

    invoke('add_to_history', { filePath }).catch(console.error);
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
      setExpandedWorkspaceId(existing.id);
      setView('directory-expanded');
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === existing.id ? { ...w, lastAccessed: new Date() } : w))
      );
      return;
    }

    const id = `dir-${Date.now()}`;
    const newWorkspace: Workspace = {
      id,
      type: 'directory',
      path: dirPath,
      displayName: dirPath.split('/').pop() || dirPath,
      lastAccessed: new Date(),
    };
    setWorkspaces((prev) => [...prev, newWorkspace]);
    setExpandedWorkspaceId(id);
    setView('directory-expanded');
  }, [workspaces]);

  const expandWorkspace = useCallback((id: string, rect?: CardRect) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (!workspace) return;

    if (rect) {
      setCardRect(rect);
      setIsExpanding(true);
    }
    setExpandedWorkspaceId(id);
    setView(workspace.type === 'file' ? 'file-expanded' : 'directory-expanded');

    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, lastAccessed: new Date() } : w))
    );
  }, [workspaces]);

  const finishExpand = useCallback(() => {
    setIsExpanding(false);
  }, []);

  const minimizeWorkspace = useCallback(() => {
    setIsMinimizing(true);
  }, []);

  const finishMinimize = useCallback(() => {
    setIsMinimizing(false);
    setExpandedWorkspaceId(null);
    setView('home');
  }, []);

  const closeWorkspace = useCallback((id: string) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (workspace?.type === 'file') {
      invoke('unwatch_file', { path: workspace.path }).catch(console.error);
    }
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
    if (expandedWorkspaceId === id) {
      setExpandedWorkspaceId(null);
      setView('home');
    }
  }, [expandedWorkspaceId, workspaces]);

  const value: AppContextValue = {
    view,
    workspaces,
    expandedWorkspaceId,
    isMinimizing,
    isExpanding,
    cardRect,
    openFile,
    openDirectory,
    expandWorkspace,
    minimizeWorkspace,
    closeWorkspace,
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
