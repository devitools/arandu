import { useState } from "react";
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

  const handleSend = () => {
    if (!input.trim() || isStreaming || disabled) return;
    onSend(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-3 space-y-2 shrink-0">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || t("chat.placeholder")}
        className="min-h-[100px] max-h-[200px] text-xs resize-y"
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
            className="text-xs gap-1.5"
          >
            <Square className="h-3 w-3" />
            {t("acp.cancel")}
          </Button>
        ) : (
          <Button
            size="sm"
            className="text-xs gap-1.5"
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
