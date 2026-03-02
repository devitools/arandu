import { useState, useRef, useEffect } from 'react';
import { Send, Square, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import type { Message } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { getDateLocale } from '@/lib/date-locale';

interface ChatPanelProps {
  messages: Message[];
  onSendMessage?: (content: string) => void;
  isStreaming?: boolean;
  onCancel?: () => void;
}

export function ChatPanel({ messages, onSendMessage, isStreaming, onCancel }: ChatPanelProps) {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSendMessage?.(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">{t('chat.emptyState')}</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground border-l-2 border-l-foreground'
                      : message.type === 'thinking'
                      ? 'bg-muted/50 border border-border italic'
                      : message.type === 'tool'
                      ? 'bg-muted/30 border border-dashed border-border'
                      : 'bg-muted border-l-2 border-l-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {message.type === 'tool' && (
                      <Wrench className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="text-xs font-medium">
                      {message.role === 'user'
                        ? t('chat.you')
                        : message.type === 'tool'
                        ? 'Tool'
                        : t('chat.assistant')}
                    </span>
                    {message.type && message.type !== 'tool' && (
                      <span className="text-xs text-muted-foreground">
                        • {message.type}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(message.timestamp), {
                        addSuffix: true,
                        locale: getDateLocale(i18n.language),
                      })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            className="min-h-[44px] max-h-[200px] resize-none"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              onClick={onCancel}
              size="icon"
              variant="destructive"
              className="h-[44px] w-[44px] flex-shrink-0"
              title={t('acp.cancel')}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              size="icon"
              disabled={!input.trim()}
              className="h-[44px] w-[44px] flex-shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
