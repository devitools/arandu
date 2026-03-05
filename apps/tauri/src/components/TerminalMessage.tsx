import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AcpMessage } from "@/types/acp";
import { shortenPaths } from "@/lib/format-path";

interface TerminalMessageProps {
  message: AcpMessage;
  isLast?: boolean;
  isStreaming?: boolean;
}

const remarkPlugins = [remarkGfm];

const markdownComponents: Components = {
  table: ({ children, ...props }) => (
    <div className="terminal-table-wrapper">
      <table {...props}>{children}</table>
    </div>
  ),
};

export function TerminalMessage({ message, isLast, isStreaming }: TerminalMessageProps) {
  if (message.role === "user") {
    const lines = message.content.split("\n");
    const firstLine = lines[0];
    const isCollapsible = lines.length > 1 || message.content.length > 120;

    if (!isCollapsible) {
      return (
        <div className="terminal-msg terminal-msg-user">
          <span className="text-muted-foreground font-bold mt-px text-xs select-none">›</span>
          <span className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
            {message.content}
          </span>
        </div>
      );
    }

    const rest = lines.slice(1).join("\n");
    return (
      <div className="terminal-msg terminal-msg-user terminal-msg-user--collapsible">
        <details open>
          <summary className="font-mono text-xs text-muted-foreground">
            {firstLine}
          </summary>
          {rest && (
            <div className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words mt-1 terminal-user-body">
              {rest}
            </div>
          )}
        </details>
      </div>
    );
  }

  if (message.type === "tool") {
    const title = shortenPaths(message.toolTitle || message.content);
    const content = message.toolTitle ? shortenPaths(message.content) : "";
    const contentLines = content ? content.split('\n').filter(l => l.trim()) : [];
    const hasContent = message.toolStatus === "completed" && contentLines.length > 0;

    return (
      <div className="terminal-msg">
        <span className="dot-wrapper text-xs flex-shrink-0">
          <span className={`dot ${message.toolStatus === "completed" ? "dot-tool" : isLast ? "dot-thinking" : "dot-pending"}`} />
        </span>
        <div className="font-mono text-xs min-w-0">
          <span className="font-semibold text-foreground">
            {title}
          </span>
          {message.toolStatus === "completed" && (
            <span className="ml-1.5 text-[#3dd68c]/60 text-[10px]">done</span>
          )}
          {hasContent && content.length <= 120 && contentLines.length === 1 ? (
            <div className="tool-content-inline">
              └ {contentLines[0]}
            </div>
          ) : hasContent && (
            <details className="tool-content">
              <summary>
                └ {contentLines.length} lines...
              </summary>
              <pre>
                {content}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  if (message.type === "thinking") {
    return (
      <div className="terminal-msg">
        <span className="dot-wrapper text-xs flex-shrink-0">
          <span className={`dot ${isLast ? "dot-thinking" : "dot-pending"}`} />
        </span>
        <details className="terminal-thinking min-w-0">
          <summary className="font-mono text-xs text-muted-foreground/50 italic cursor-pointer select-none">
            Thinking…
          </summary>
          <div className="terminal-markdown font-mono text-[11px] text-muted-foreground/40 break-words mt-1">
            <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>{message.content}</Markdown>
          </div>
        </details>
      </div>
    );
  }

  if (message.type === "notice") {
    return (
      <div className="terminal-msg">
        <span />
        <div className="terminal-markdown font-mono text-xs text-muted-foreground/60 break-words min-w-0">
          <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>{message.content}</Markdown>
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
      <span className="dot-wrapper text-xs flex-shrink-0">
        <span className="dot dot-agent" />
      </span>
      <div className="terminal-markdown font-mono text-xs text-foreground break-words min-w-0">
        <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>{content}</Markdown>
        {showCursor && <span className="streaming-cursor" />}
      </div>
    </div>
  );
}
