import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

interface MicButtonProps {
  size?: "default" | "sm";
  onTranscriptionComplete?: (text: string) => void;
}

export function MicButton({ size = "default", onTranscriptionComplete }: MicButtonProps) {
  const { t } = useTranslation();
  const callbackRef = useRef(onTranscriptionComplete);
  callbackRef.current = onTranscriptionComplete;
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!isRecording || !callbackRef.current) return;
    const unsubs = [
      listen<string>("transcription-complete", (e) => {
        callbackRef.current?.(e.payload);
        setIsRecording(false);
      }),
      listen("transcription-error", () => setIsRecording(false)),
      listen("recording-cancelled", () => setIsRecording(false)),
    ];
    return () => {
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, [isRecording]);

  const handleClick = async () => {
    try {
      const loaded = await invoke<boolean>("is_model_loaded");
      if (!loaded) {
        toast.error(t("whisper.noModelLoaded"));
        return;
      }
      if (onTranscriptionComplete) {
        setIsRecording(true);
        await invoke("start_recording_field_mode");
      } else {
        await invoke("start_recording_button_mode");
      }
    } catch (err) {
      setIsRecording(false);
      toast.error(String(err));
    }
  };

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const buttonSize = size === "sm" ? "h-7 w-7" : "h-9 w-9";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={buttonSize}
          onClick={handleClick}
        >
          <Mic className={iconSize} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{t("whisper.recordTooltip")}</p>
      </TooltipContent>
    </Tooltip>
  );
}
