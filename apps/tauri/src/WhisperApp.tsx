import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeProvider } from "next-themes";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;
const { invoke } = window.__TAURI__.core;

type ViewState = "idle" | "recording" | "transcribing" | "complete" | "error";

interface WhisperSettings {
  active_model: string | null;
  shortcut: string;
  cancel_shortcut: string;
  long_recording_threshold: number;
}

function formatShortcutLabel(shortcut: string): string {
  return shortcut
    .replace("Alt", "\u2325")
    .replace("Shift", "\u21E7")
    .replace("Control", "\u2303")
    .replace("Super", "\u2318")
    .replace("Cmd", "\u2318")
    .replace("CmdOrCtrl", "\u2318")
    .replace(/\+/g, "");
}

function WhisperContent() {
  const { t } = useTranslation();
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewText, setPreviewText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [longThreshold, setLongThreshold] = useState(60);
  const [stopLabel, setStopLabel] = useState("\u2325Space");
  const [cancelLabel, setCancelLabel] = useState("\u2325\u21E7Space");
  const [modelLabel, setModelLabel] = useState("");

  const modeRef = useRef<"button" | "shortcut" | "field" | null>(null);
  const startTimeRef = useRef(0);
  const lastTextRef = useRef("");
  const currentWindow = getCurrentWindow();

  useEffect(() => {
    if (viewState !== "recording") return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 100);
    return () => clearInterval(id);
  }, [viewState]);

  useEffect(() => {
    invoke<WhisperSettings>("get_whisper_settings")
      .then((s) => {
        setLongThreshold(s.long_recording_threshold || 60);
        setStopLabel(formatShortcutLabel(s.shortcut));
        setCancelLabel(formatShortcutLabel(s.cancel_shortcut));
        if (s.active_model) {
          setModelLabel(s.active_model.charAt(0).toUpperCase() + s.active_model.slice(1));
        }
      })
      .catch(console.error);
  }, []);

  const beginRecording = useCallback((mode: "button" | "shortcut" | "field") => {
    modeRef.current = mode;
    startTimeRef.current = Date.now();
    setElapsed(0);
    setViewState("recording");
  }, []);

  const handleStop = useCallback(async () => {
    setViewState("transcribing");
    await new Promise((r) => setTimeout(r, 300));
    try {
      await invoke("stop_and_transcribe");
    } catch (e) {
      console.error("stop_and_transcribe failed:", e);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    modeRef.current = null;
    setViewState("idle");
    try {
      await invoke("cancel_recording");
    } catch (e) {
      console.error("cancel_recording failed:", e);
    }
    await currentWindow.hide();
  }, [currentWindow]);

  useEffect(() => {
    const unsubs = [
      listen("start-recording-shortcut", () => {
        currentWindow.show();
        beginRecording("shortcut");
      }),
      listen("start-recording-button", () => {
        currentWindow.show();
        beginRecording("button");
      }),
      listen("start-recording-field", () => {
        currentWindow.show();
        beginRecording("field");
      }),
      listen("stop-recording", () => {
        handleStop();
      }),
      listen<string>("transcription-complete", async (e) => {
        lastTextRef.current = e.payload;
        setPreviewText(
          e.payload.length > 60 ? e.payload.substring(0, 60) + "\u2026" : e.payload
        );
        setViewState("complete");
        if (modeRef.current === "shortcut") {
          try {
            await invoke("write_clipboard", { text: e.payload });
          } catch {}
        }
        if (modeRef.current === "shortcut" || modeRef.current === "field") {
          setTimeout(() => currentWindow.hide(), 500);
        }
      }),
      listen<string>("transcription-error", (e) => {
        setErrorMsg(
          e.payload.length > 50 ? e.payload.substring(0, 50) + "\u2026" : e.payload
        );
        setViewState("error");
      }),
      listen<string>("recording-error", (e) => {
        modeRef.current = null;
        setErrorMsg(
          e.payload.length > 50 ? e.payload.substring(0, 50) + "\u2026" : e.payload
        );
        setViewState("error");
      }),
      listen("recording-cancelled", () => {
        modeRef.current = null;
        setViewState("idle");
        currentWindow.hide();
      }),
    ];

    return () => {
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, [currentWindow, beginRecording, handleStop]);

  useEffect(() => {
    invoke<boolean>("is_currently_recording")
      .then(async (r) => {
        if (!r) return;
        try {
          const mode = await invoke<string | null>("get_recording_mode");
          beginRecording((mode as "button" | "shortcut" | "field") || "button");
        } catch {
          beginRecording("button");
        }
      })
      .catch(() => {});
  }, [beginRecording]);

  useEffect(() => {
    const cleanup = currentWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await currentWindow.hide();
    });
    return () => {
      cleanup.then((fn) => fn());
    };
  }, [currentWindow]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [handleCancel]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const isLong = elapsed >= longThreshold;

  if (viewState === "idle") {
    return <div className="h-screen w-screen" style={{ background: "transparent" }} />;
  }

  return (
    <div
      className="h-screen w-screen"
      style={{ background: "transparent", padding: "18px 18px 22px 18px" }}
    >
      <div className="w-full h-full rounded-[14px] bg-background overflow-hidden relative flex items-center p-2.5 gap-3.5 border border-border/20 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.12),0_2px_6px_-1px_rgba(0,0,0,0.06)] backdrop-blur-[40px] backdrop-saturate-[1.8]">
        <div className="absolute top-0 left-0 right-0 h-10 z-20 pointer-events-none">
          <div className="w-full h-full pointer-events-auto" data-tauri-drag-region />
        </div>

        <div className="w-full h-full flex items-center px-[22px] py-4 gap-4 relative z-10">
          {viewState === "recording" && (
            <>
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <span className="relative flex h-6 w-6">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-40" />
                  <span className="relative inline-flex rounded-full h-6 w-6 bg-destructive" />
                </span>
              </div>
              <div className="flex-1 flex flex-col justify-center gap-0.5">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-light tabular-nums min-w-[50px]">
                    {fmt(elapsed)}
                  </span>
                  <span
                    className={`text-sm font-medium whitespace-nowrap ${isLong ? "text-orange-500" : ""}`}
                  >
                    {isLong ? t("whisper.longRecording") : t("whisper.recording")}
                  </span>
                </div>
                {modelLabel && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {modelLabel}
                  </span>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleStop}
                  className="min-w-[100px] flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  {t("whisper.stop")}
                  <span className="text-[10px] opacity-60 font-normal">{stopLabel}</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="min-w-[100px] flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {t("whisper.cancel")}
                  <span className="text-[10px] opacity-60 font-normal">{cancelLabel}</span>
                </button>
              </div>
            </>
          )}

          {viewState === "transcribing" && (
            <>
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <div className="w-6 h-6 border-2 border-border border-t-orange-500 rounded-full animate-spin" />
              </div>
              <div className="flex-1 flex flex-col justify-center gap-0.5">
                <span className="text-sm font-medium">{t("whisper.transcribing")}</span>
                {modelLabel && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {modelLabel}
                  </span>
                )}
              </div>
              <span className="text-[13px] text-muted-foreground shrink-0">
                {t("whisper.recorded", { time: fmt(elapsed) })}
              </span>
            </>
          )}

          {viewState === "complete" && (
            <>
              <div className="w-8 h-8 shrink-0">
                <div className="w-8 h-8 bg-green-600 dark:bg-green-500 rounded-lg flex items-center justify-center text-white text-lg">
                  ✓
                </div>
              </div>
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium">{t("whisper.complete")}</span>
                <span className="text-[13px] text-muted-foreground truncate">
                  {previewText}
                </span>
              </div>
              {modeRef.current !== "shortcut" && modeRef.current !== "field" && (
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={async () => {
                    if (lastTextRef.current) {
                      try {
                        await invoke("write_clipboard", { text: lastTextRef.current });
                      } catch {}
                    }
                    currentWindow.hide();
                  }}
                >
                  {t("whisper.copyAndClose")}
                </Button>
              )}
            </>
          )}

          {viewState === "error" && (
            <>
              <div className="w-8 h-8 shrink-0">
                <div className="w-8 h-8 bg-destructive rounded-lg flex items-center justify-center text-white text-lg">
                  ✕
                </div>
              </div>
              <div className="flex-1 flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium">{t("whisper.error")}</span>
                <span className="text-[13px] text-muted-foreground truncate">
                  {errorMsg}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await invoke("start_recording");
                      beginRecording("button");
                    } catch (e) {
                      setErrorMsg(String(e));
                    }
                  }}
                >
                  {t("whisper.retry")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => currentWindow.hide()}
                >
                  {t("whisper.close")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function WhisperApp() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="arandu-theme">
      <WhisperContent />
    </ThemeProvider>
  );
}
