import { useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
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
  onClearHistory?: () => void;
  disabled?: boolean;
  placeholder?: string;
  initialPrompt?: string;
  /** Called when user scrolls to the top to load older messages */
  onLoadMore?: () => void;
  /** Whether there are more messages to load above */
  hasMore?: boolean;
  /** Whether older messages are being loaded */
  isLoadingMore?: boolean;
}

export function TerminalChat({
  messages,
  errors,
  isStreaming,
  onSend,
  onCancel,
  onClearErrors,
  onClearHistory,
  disabled,
  placeholder,
  initialPrompt,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: TerminalChatProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number>(0);

  // Stick-to-bottom: track whether user is near the bottom of the scroll area
  const isNearBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll on any content change (new messages OR streaming content updates)
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastMsg = messages[messages.length - 1];
    const isNewUserMsg = messages.length > prevMessageCountRef.current && lastMsg?.role === "user";
    prevMessageCountRef.current = messages.length;
    if (isNewUserMsg || isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Preserve scroll position after prepending older messages
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !prevScrollHeightRef.current) return;
    const diff = el.scrollHeight - prevScrollHeightRef.current;
    if (diff > 0) {
      el.scrollTop += diff;
    }
    prevScrollHeightRef.current = 0;
  });

  // IntersectionObserver to trigger loadMore when sentinel enters view
  const handleSentinel = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && onLoadMore && !isLoadingMore) {
        prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
        onLoadMore();
      }
    },
    [hasMore, isLoadingMore, onLoadMore]
  );

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(handleSentinel, {
      root: scrollRef.current,
      threshold: 0.1,
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [handleSentinel, onLoadMore]);

  return (
    <div className="h-full flex flex-col min-h-0 bg-card">
      <div className="flex-1 relative min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden py-4 terminal-scroll-fade">
        {/* Scroll sentinel for infinite scroll (load older messages) */}
        {onLoadMore && (
          <div ref={sentinelRef} className="flex justify-center py-2 min-h-[2px]">
            {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {!isLoadingMore && hasMore && (
              <button
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={() => {
                  prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
                  onLoadMore();
                }}
              >
                {t("chat.loadMore", "Load older messages")}
              </button>
            )}
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-stretch gap-3">
            {initialPrompt ? (
              <div className="px-4 py-3 mx-4 rounded border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground/60 font-mono mb-1">{t("sessions.formPrompt")}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">{initialPrompt}</p>
              </div>
            ) : (
              <p className="text-muted-foreground/50 font-mono text-sm">
                {t("chat.emptyState")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
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
        onClearHistory={onClearHistory}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}
