import { useRef, useState, useEffect } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/MicButton";
import { useTranslation } from "react-i18next";

interface TerminalInputProps {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onCancel: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TerminalInput({
  onSend,
  isStreaming,
  onCancel,
  disabled,
  placeholder,
}: TerminalInputProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(80);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  const dragListenersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        document.removeEventListener("mousemove", dragListenersRef.current.onMove);
        document.removeEventListener("mouseup", dragListenersRef.current.onUp);
      }
    };
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { y: e.clientY, h: inputHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.y - ev.clientY;
      setInputHeight(Math.min(400, Math.max(80, dragRef.current.h + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      dragListenersRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    dragListenersRef.current = { onMove, onUp };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming || disabled) return;
    onSend(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-3 space-y-2 shrink-0 bg-card/80">
      <div
        className="h-1.5 -mt-1 cursor-row-resize flex items-center justify-center group"
        onMouseDown={handleDragStart}
      >
        <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-muted-foreground/40 transition-colors" />
      </div>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || t("chat.placeholder")}
        style={{ height: inputHeight }}
        className="text-xs resize-none font-mono bg-background/50 border-border/60 placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-ring/30 focus-visible:ring-offset-0"
        disabled={isStreaming || disabled}
      />
      <div className="flex items-center justify-end gap-2">
        {!isStreaming && !disabled && (
          <MicButton size="sm" onTranscriptionComplete={(text) => setInput((prev) => prev + text)} />
        )}
        {isStreaming ? (
          <Button
            onClick={onCancel}
            size="sm"
            variant="destructive"
            className="text-xs gap-1.5 min-w-[100px]"
          >
            <Square className="h-3 w-3" />
            {t("acp.cancel")}
          </Button>
        ) : (
          <Button
            size="sm"
            className="text-xs gap-1.5 font-mono min-w-[100px]"
            onClick={handleSend}
            disabled={!input.trim() || disabled}
          >
            <Send className="h-3 w-3" />
            {t("chat.send")}
          </Button>
        )}
      </div>
    </div>
  );
}
