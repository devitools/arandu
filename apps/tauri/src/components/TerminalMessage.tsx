import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AcpMessage } from "@/types/acp";

interface TerminalMessageProps {
  message: AcpMessage;
  isLast?: boolean;
  isStreaming?: boolean;
}

const remarkPlugins = [remarkGfm];

export function TerminalMessage({ message, isLast, isStreaming }: TerminalMessageProps) {
  if (message.role === "user") {
    return (
      <div className="terminal-msg terminal-msg-user">
        <span className="text-[#3dd68c] font-bold mt-[2px] text-sm select-none">›</span>
        <span className="font-mono text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.type === "tool") {
    return (
      <div className="terminal-msg">
        <span className="dot-wrapper text-sm flex-shrink-0">
          <span className="dot dot-tool" />
        </span>
        <details className="font-mono text-sm text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            {message.toolTitle || message.content}
            {message.toolStatus === "completed" && (
              <span className="ml-2 text-[#3dd68c]/70 text-xs">done</span>
            )}
          </summary>
          {message.toolStatus === "completed" && (
            <pre className="mt-1 text-xs text-muted-foreground/70 whitespace-pre-wrap overflow-hidden">
              {message.content}
            </pre>
          )}
        </details>
      </div>
    );
  }

  if (message.type === "thinking") {
    return (
      <div className="terminal-msg">
        <span className="dot-wrapper text-sm flex-shrink-0">
          <span className="dot dot-thinking" />
        </span>
        <div className="terminal-markdown font-mono text-sm text-muted-foreground/70 italic break-words min-w-0">
          <Markdown remarkPlugins={remarkPlugins}>{message.content}</Markdown>
        </div>
      </div>
    );
  }

  if (message.type === "notice") {
    return (
      <div className="terminal-msg">
        <span />
        <div className="terminal-markdown font-mono text-xs text-muted-foreground/60 break-words min-w-0">
          <Markdown remarkPlugins={remarkPlugins}>{message.content}</Markdown>
        </div>
      </div>
    );
  }

  return <AgentMessage message={message} isLast={isLast} isStreaming={isStreaming} />;
}

function AgentMessage({ message, isLast, isStreaming }: TerminalMessageProps) {
  const showCursor = isLast && isStreaming;
  const content = useMemo(() => message.content, [message.content]);

  return (
    <div className="terminal-msg">
      <span className="dot-wrapper text-sm flex-shrink-0">
        <span className="dot dot-agent" />
      </span>
      <div className="terminal-markdown font-mono text-sm text-foreground break-words min-w-0">
        <Markdown remarkPlugins={remarkPlugins}>{content}</Markdown>
        {showCursor && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}
