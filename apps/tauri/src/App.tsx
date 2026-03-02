import { useEffect, useRef } from "react";
import { ThemeProvider } from "next-themes";
import { AppProvider, useApp, ANIMATION_DURATION } from "@/contexts/AppContext";
import { TopBar } from "@/components/TopBar";
import { HomeScreen } from "@/components/HomeScreen";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { DirectoryWorkspace } from "@/components/DirectoryWorkspace";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { initHomeDir } from "@/lib/format-path";
import { updateTrayLabels } from "@/lib/tray-sync";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const { getCurrentWindow } = window.__TAURI__.window;
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const EXPAND_EASING = "cubic-bezier(0.3, 0.0, 0.0, 1)";
const MINIMIZE_EASING = "cubic-bezier(0.3, 0.0, 0.8, 0.15)";

function AppContent() {
  const {
    view, openFile, openDirectory, minimizeWorkspace,
    isMinimizing, isExpanding, cardRect, expandedWorkspaceId,
    finishExpand, finishMinimize,
  } = useApp();
  const mainRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanding) return;
    const overlay = overlayRef.current;
    const content = contentRef.current;
    const mainEl = mainRef.current;
    if (!overlay || !mainEl || !cardRect) {
      finishExpand();
      return;
    }

    const sourceCard = expandedWorkspaceId
      ? mainEl.querySelector<HTMLElement>(`[data-workspace-id="${expandedWorkspaceId}"]`)
      : null;
    if (sourceCard) sourceCard.style.opacity = "0";

    const mainW = mainEl.clientWidth;
    const mainH = mainEl.clientHeight;
    const r = cardRect;
    const insetFrom = `inset(${r.top}px ${mainW - r.left - r.width}px ${mainH - r.top - r.height}px ${r.left}px round 6px)`;

    const clipAnim = overlay.animate(
      [{ clipPath: insetFrom }, { clipPath: "inset(0 0 0 0 round 0px)" }],
      { duration: ANIMATION_DURATION, easing: EXPAND_EASING, fill: "forwards" }
    );

    const contentAnim = content?.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 200, easing: "ease-out", delay: 120, fill: "forwards" }
    );

    clipAnim.finished.then(() => {
      overlay.style.clipPath = "";
      if (content) content.style.opacity = "";
      if (sourceCard) sourceCard.style.opacity = "";
      finishExpand();
    }).catch(() => {});

    return () => {
      clipAnim.cancel();
      contentAnim?.cancel();
      if (sourceCard) sourceCard.style.opacity = "";
      if (content) content.style.opacity = "";
    };
  }, [isExpanding, cardRect, expandedWorkspaceId, finishExpand]);

  useEffect(() => {
    if (!isMinimizing) return;
    const overlay = overlayRef.current;
    const content = contentRef.current;
    const mainEl = mainRef.current;
    if (!overlay || !mainEl) {
      finishMinimize();
      return;
    }

    const card = expandedWorkspaceId
      ? mainEl.querySelector<HTMLElement>(`[data-workspace-id="${expandedWorkspaceId}"]`)
      : null;

    if (!card) {
      finishMinimize();
      return;
    }

    card.style.opacity = "0";

    const mainW = mainEl.clientWidth;
    const mainH = mainEl.clientHeight;
    const mainVp = mainEl.getBoundingClientRect();
    const cardVp = card.getBoundingClientRect();
    const t = {
      top: cardVp.top - mainVp.top,
      left: cardVp.left - mainVp.left,
      width: cardVp.width,
      height: cardVp.height,
    };
    const insetTo = `inset(${t.top}px ${mainW - t.left - t.width}px ${mainH - t.top - t.height}px ${t.left}px round 6px)`;

    const clipAnim = overlay.animate(
      [{ clipPath: "inset(0 0 0 0 round 0px)" }, { clipPath: insetTo }],
      { duration: ANIMATION_DURATION, easing: MINIMIZE_EASING, fill: "forwards" }
    );

    const contentAnim = content?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 150, easing: "ease-in", fill: "forwards" }
    );

    clipAnim.finished.then(() => {
      card.style.opacity = "";
      finishMinimize();
    }).catch(() => {});

    return () => {
      clipAnim.cancel();
      contentAnim?.cancel();
      card.style.opacity = "";
      if (content) content.style.opacity = "";
    };
  }, [isMinimizing, expandedWorkspaceId, finishMinimize]);

  useEffect(() => {
    invoke<string | null>("get_initial_file").then((path) => {
      if (path) openFile(path);
    }).catch(console.error);

    const unlistenOpen = listen<string>("open-file", (event) => {
      openFile(event.payload);
    });

    const unlistenMenu = listen("menu-open-file", () => {
      openFile();
    });

    return () => {
      unlistenOpen.then((fn) => fn());
      unlistenMenu.then((fn) => fn());
    };
  }, [openFile]);

  useKeyboardShortcuts([
    {
      key: 'o',
      metaKey: true,
      shiftKey: false,
      handler: () => {
        if (view === 'home') {
          openFile();
        }
      },
    },
    {
      key: 'o',
      metaKey: true,
      shiftKey: true,
      handler: () => {
        if (view === 'home') {
          openDirectory();
        }
      },
    },
    {
      key: 'Escape',
      handler: () => {
        if (view === 'file-expanded' || view === 'directory-expanded') {
          minimizeWorkspace();
        }
      },
      preventDefault: false,
    },
  ]);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
      <TopBar />
      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden relative">
        <HomeScreen />
        {(view === "file-expanded" || view === "directory-expanded") && (
          <div
            ref={overlayRef}
            className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background"
            style={isExpanding || isMinimizing ? { pointerEvents: "none" } : undefined}
          >
            <div ref={contentRef} className="flex-1 flex flex-col overflow-hidden">
              {view === "file-expanded" ? <MarkdownViewer /> : <DirectoryWorkspace />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  useEffect(() => {
    initHomeDir().catch(console.error);
    updateTrayLabels(localStorage.getItem("arandu-language") || "pt-BR");

    const showWindow = async () => {
      const appWindow = getCurrentWindow();
      if (appWindow.label !== "main") return;
      await appWindow.show();
      await appWindow.setFocus();
    };

    showWindow().catch(console.error);
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="arandu-theme">
        <TooltipProvider>
          <AppProvider>
            <AppContent />
            <Toaster position="bottom-center" />
          </AppProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
