import { useTranslation } from "react-i18next";
import { Activity, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AcpConnectionLogEntry } from "@/types/acp";

const LEVEL_STYLES: Record<string, string> = {
  info: "text-blue-500",
  warn: "text-yellow-500",
  error: "text-red-500",
};

interface ConnectionLogsProps {
  logs: AcpConnectionLogEntry[];
  hasRecentErrors: boolean;
  onClear: () => void;
}

export function ConnectionLogs({ logs, hasRecentErrors, onClear }: ConnectionLogsProps) {
  const { t } = useTranslation();

  const handleCopy = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.event}: ${l.message}`)
      .join("\n");
    void copyToClipboard(text);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground relative"
          title={t("acp.logs")}
        >
          <Activity className="h-3.5 w-3.5" />
          {hasRecentErrors && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-500" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("acp.logs")}</DialogTitle>
        </DialogHeader>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t("acp.logsEmpty")}
          </p>
        ) : (
          <>
            <ScrollArea className="h-[300px] rounded border border-border bg-muted/30 p-2">
              <div className="space-y-1">
                {logs.map((entry, idx) => (
                  <div key={idx} className="font-mono text-xs leading-relaxed">
                    <span className="text-muted-foreground/50">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>{" "}
                    <span className={LEVEL_STYLES[entry.level] ?? "text-muted-foreground"}>
                      {entry.level.toUpperCase()}
                    </span>{" "}
                    <span className="text-muted-foreground">{entry.event}:</span>{" "}
                    <span className="text-foreground">{entry.message}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onClear}>
                <Trash2 className="h-3 w-3" />
                {t("acp.logsClear")}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleCopy}>
                <Copy className="h-3 w-3" />
                {t("acp.logsCopy")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
