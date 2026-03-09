import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trans, useTranslation } from "react-i18next";
import type { SessionRecord, PlanPhase } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/date-locale";

interface SessionCardProps {
  session: SessionRecord;
  onSelect: (session: SessionRecord) => void;
  onDelete: (id: string) => void;
  connectionStatus?: "connected" | "disconnected" | "connecting" | "idle";
}

const PHASE_COLORS: Record<PlanPhase, string> = {
  idle: "bg-muted-foreground/30",
  planning: "bg-yellow-500",
  reviewing: "bg-blue-500",
  executing: "bg-green-500",
  done: "bg-purple-500",
};

const PHASE_KEYS: Record<PlanPhase, string> = {
  idle: "plan.phaseIdle",
  planning: "plan.phasePlanning",
  reviewing: "plan.phaseReviewing",
  executing: "plan.phaseExecuting",
  done: "plan.phaseDone",
};

const CONN_COLORS: Record<string, string> = {
  connected: "bg-green-500",
  connecting: "bg-yellow-400 animate-pulse",
  disconnected: "bg-muted-foreground/30",
  idle: "bg-muted-foreground/20",
};

export function SessionCard({ session, onSelect, onDelete, connectionStatus }: SessionCardProps) {
  const { t, i18n } = useTranslation();

  return (
    <Card
      className="group relative px-5 py-4 cursor-pointer hover:bg-accent/50 transition-colors duration-150 min-h-[120px] flex flex-col justify-between"
      onClick={() => onSelect(session)}
    >
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => e.stopPropagation()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sessions.deleteSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="sessions.deleteSessionDescription"
                values={{ name: session.name }}
                components={{ strong: <strong /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(session.id)}>
              {t("sessions.deleteSession")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h3 className="font-semibold text-base line-clamp-2 pr-6 leading-snug">{session.name}</h3>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", PHASE_COLORS[session.phase])} />
            <span className="text-xs text-muted-foreground">
              {t(PHASE_KEYS[session.phase])}
            </span>
            <span className="text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded uppercase tracking-wider">
              {session.provider === "claude" ? t("settings.providerClaude") : t("settings.providerCopilot")}
            </span>
          </div>
          {connectionStatus && connectionStatus !== "idle" && (
            <span
              className={cn("w-2 h-2 rounded-full flex-shrink-0", CONN_COLORS[connectionStatus])}
              title={connectionStatus}
            />
          )}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground mt-3 text-right">
        {formatDistanceToNow(new Date(session.updated_at * 1000), {
          addSuffix: true,
          locale: getDateLocale(i18n.language),
        })}
      </div>
    </Card>
  );
}
