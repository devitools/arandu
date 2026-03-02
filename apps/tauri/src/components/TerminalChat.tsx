import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcpMessage } from "@/types/acp";
import { TerminalMessage } from "./TerminalMessage";
import { TerminalInput } from "./TerminalInput";
import { ErrorConsole } from "./ErrorConsole";

interface TerminalChatProps {
  messages: AcpMessage[];
  errors: string[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
  onClearErrors: () => void;
  onReconnect?: () => void;
  disabled?: boolean;
  placeholder?: string;
  initialPrompt?: string;
}

export function TerminalChat({
  messages,
  errors,
  isStreaming,
  onSend,
  onCancel,
  onClearErrors,
  onReconnect,
  disabled,
  placeholder,
  initialPrompt,
}: TerminalChatProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="h-full flex flex-col min-h-0 bg-card">
      <div className="flex-1 relative min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-auto py-4 terminal-scroll-fade">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            {initialPrompt ? (
              <div className="w-full px-4 py-3 mx-4 rounded border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground/60 font-mono mb-1">{t("sessions.formPrompt")}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">{initialPrompt}</p>
              </div>
            ) : (
              <p className="text-muted-foreground/50 font-mono text-sm">
                {t("chat.emptyState")}
              </p>
            )}
            {onReconnect && (
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onReconnect}>
                <RefreshCw className="h-3.5 w-3.5" />
                {t("acp.reconnect")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {initialPrompt && (
              <div className="px-4 py-3 mx-4 rounded border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground/60 font-mono mb-1">{t("sessions.formPrompt")}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">{initialPrompt}</p>
              </div>
            )}
            {messages.map((message, idx) => (
              <TerminalMessage
                key={message.id}
                message={message}
                isLast={idx === messages.length - 1}
                isStreaming={isStreaming}
              />
            ))}
          </div>
        )}
        </div>
      </div>
      <ErrorConsole errors={errors} onClear={onClearErrors} />
      <TerminalInput
        onSend={onSend}
        isStreaming={isStreaming}
        onCancel={onCancel}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
