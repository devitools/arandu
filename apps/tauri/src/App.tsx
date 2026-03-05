import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ThemeProvider } from "@/lib/theme";
import { AppProvider, useApp, ANIMATION_DURATION } from "@/contexts/AppContext";
import { TopBar } from "@/components/TopBar";
import { HomeScreen } from "@/components/HomeScreen";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { DirectoryWorkspace } from "@/components/DirectoryWorkspace";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { initHomeDir } from "@/lib/format-path";
import { updateTrayLabels, updateMenuLabels } from "@/lib/tray-sync";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import type { CardRect } from "@/types";

const { getCurrentWindow } = window.__TAURI__.window;
const { invoke } = window.__TAURI__.core;
const { listen, emit } = window.__TAURI__.event;

const EXPAND_EASING = "cubic-bezier(0.175, 0.885, 0.32, 1.05)";
const MINIMIZE_EASING = "cubic-bezier(0.32, 0, 0.15, 1)";
const DURATION_S = `${ANIMATION_DURATION / 1000}s`;
const SHADOW = "0 30px 90px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.1)";

type AnimPhase = "idle" | "preparing" | "expanding" | "settled" | "minimizing";

function AppContent() {
  const {
    view, openFile, openDirectory, minimizeWorkspace,
    isMinimizing, isExpanding, cardRect, expandedWorkspaceId,
    persistedWorkspaceId, finishExpand, finishMinimize,
  } = useApp();
  const mainRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const animTimeoutRef = useRef<number | null>(null);

  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const [flipTransform, setFlipTransform] = useState("");
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  const calcInverseTransform = useCallback((rect: CardRect) => {
    const mainEl = mainRef.current;
    if (!mainEl) return "";
    const mainW = mainEl.clientWidth;
    const mainH = mainEl.clientHeight;
    const sx = rect.width / mainW;
    const sy = rect.height / mainH;
    const tx = (rect.left + rect.width / 2) - mainW / 2;
    const ty = (rect.top + rect.height / 2) - mainH / 2;
    return `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
  }, []);

  // --- EXPAND phase 1: mount overlay at card position (no transition) ---
  // Must be useLayoutEffect so the inverse transform is applied before the browser paints
  // the newly mounted overlay. Otherwise there's a 1-frame flash at full size.
  useLayoutEffect(() => {
    if (!isExpanding) return;
    if (!cardRect) {
      setFlipTransform("");
      setTransitionEnabled(false);
      setAnimPhase("settled");
      finishExpand();
      return;
    }
    setFlipTransform(calcInverseTransform(cardRect));
    setTransitionEnabled(false);
    setAnimPhase("preparing");
  }, [isExpanding, cardRect, calcInverseTransform, finishExpand]);

  // --- EXPAND phase 2: after first paint, enable transition → animate to identity ---
  useLayoutEffect(() => {
    if (animPhase !== "preparing") return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    // Force reflow: browser must paint inverse transform before we animate
    void overlay.offsetHeight;

    // Hide source card during animation
    const mainEl = mainRef.current;
    const sourceCard = expandedWorkspaceId && mainEl
      ? mainEl.querySelector<HTMLElement>(`[data-workspace-id="${expandedWorkspaceId}"]`)
      : null;
    if (sourceCard) sourceCard.style.opacity = "0";

    setFlipTransform("translate(0px, 0px) scale(1, 1)");
    setTransitionEnabled(true);
    setAnimPhase("expanding");

    if (animTimeoutRef.current !== null) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      setAnimPhase("settled");
      setFlipTransform("");
      setTransitionEnabled(false);
      if (sourceCard) sourceCard.style.opacity = "";
      finishExpand();
    }, ANIMATION_DURATION);
  }, [animPhase, expandedWorkspaceId, finishExpand]);

  // --- MINIMIZE: animate from identity → card position ---
  useEffect(() => {
    if (!isMinimizing) return;
    const mainEl = mainRef.current;
    if (!mainEl) { finishMinimize(); return; }

    const card = expandedWorkspaceId
      ? mainEl.querySelector<HTMLElement>(`[data-workspace-id="${expandedWorkspaceId}"]`)
      : null;
    if (!card) { finishMinimize(); return; }

    card.style.opacity = "0";

    const mainVp = mainEl.getBoundingClientRect();
    const cardVp = card.getBoundingClientRect();
    const rect: CardRect = {
      top: cardVp.top - mainVp.top,
      left: cardVp.left - mainVp.left,
      width: cardVp.width,
      height: cardVp.height,
    };

    setTransitionEnabled(true);
    setFlipTransform(calcInverseTransform(rect));
    setAnimPhase("minimizing");

    if (animTimeoutRef.current !== null) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      card.style.opacity = "";
      setAnimPhase("idle");
      setFlipTransform("");
      setTransitionEnabled(false);
      finishMinimize();
    }, ANIMATION_DURATION);
  }, [isMinimizing, expandedWorkspaceId, calcInverseTransform, finishMinimize]);

  useEffect(() => () => {
    if (animTimeoutRef.current !== null) clearTimeout(animTimeoutRef.current);
  }, []);

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

    const unlistenInstallCli = listen("menu-install-cli", () => {
      invoke("show_settings_window").catch(console.error);
      emit("open-settings-tab", "cli").catch(console.error);
    });

    return () => {
      unlistenOpen.then((fn) => fn());
      unlistenMenu.then((fn) => fn());
      unlistenInstallCli.then((fn) => fn());
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

  const isAnimating = animPhase !== "idle" && animPhase !== "settled";

  const overlayStyle: React.CSSProperties = {
    transform: flipTransform || undefined,
    transition: transitionEnabled
      ? `transform ${DURATION_S} ${animPhase === "minimizing" ? MINIMIZE_EASING : EXPAND_EASING}`
      : "none",
    transformOrigin: "center center",
    willChange: isAnimating ? "transform" : undefined,
    borderRadius: isAnimating ? 10 : 0,
    boxShadow: isAnimating ? SHADOW : "none",
    pointerEvents: isAnimating ? "none" : undefined,
  };

  const contentStyle: React.CSSProperties = {
    opacity: animPhase === "preparing" ? 0.4 : animPhase === "minimizing" ? 0.2 : 1,
    transition: animPhase === "expanding"
      ? "opacity 0.25s ease-out 0.1s"
      : animPhase === "minimizing"
        ? "opacity 0.18s ease-in"
        : "none",
  };

  const backdropStyle: React.CSSProperties = {
    opacity: animPhase === "preparing" || animPhase === "minimizing" ? 0 : 1,
    transition: `opacity ${DURATION_S} ${animPhase === "minimizing" ? "ease-in" : "ease-out"}`,
  };

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
      <TopBar />
      <main ref={mainRef} className="flex-1 flex flex-col overflow-hidden relative">
        <HomeScreen />
        {view === "file-expanded" && (
          <>
            {isAnimating && (
              <div
                className="absolute inset-0 z-[9] bg-black/45 pointer-events-none"
                style={backdropStyle}
              />
            )}
            <div
              ref={overlayRef}
              className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background"
              style={overlayStyle}
            >
              <div className="flex-1 flex flex-col overflow-hidden" style={contentStyle}>
                <MarkdownViewer />
              </div>
            </div>
          </>
        )}

        {(view === "directory-expanded" || persistedWorkspaceId) && (
          <>
            {view === "directory-expanded" && isAnimating && (
              <div
                className="absolute inset-0 z-[9] bg-black/45 pointer-events-none"
                style={backdropStyle}
              />
            )}
            <div
              ref={view === "directory-expanded" ? overlayRef : undefined}
              className={view === "directory-expanded"
                ? "absolute inset-0 z-10 flex flex-col overflow-hidden bg-background"
                : "hidden"
              }
              style={view === "directory-expanded" ? overlayStyle : undefined}
            >
              <div
                className="flex-1 flex flex-col overflow-hidden"
                style={view === "directory-expanded" ? contentStyle : undefined}
              >
                <DirectoryWorkspace key={persistedWorkspaceId} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  useEffect(() => {
    initHomeDir().catch(console.error);
    updateTrayLabels(localStorage.getItem("arandu-language") || "pt-BR");
    updateMenuLabels(localStorage.getItem("arandu-language") || "pt-BR");

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
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        storageKey="arandu-theme"
        disableTransitionOnChange
      >
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
