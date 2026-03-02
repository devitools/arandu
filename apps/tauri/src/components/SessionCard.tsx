import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import type { SessionRecord, PlanPhase } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/date-locale";

interface SessionCardProps {
  session: SessionRecord;
  onSelect: (session: SessionRecord) => void;
  onDelete: (id: string) => void;
}

const PHASE_COLORS: Record<PlanPhase, string> = {
  idle: "bg-muted-foreground/30",
  planning: "bg-yellow-500",
  reviewing: "bg-blue-500",
  executing: "bg-green-500",
  done: "bg-emerald-500",
};

const PHASE_KEYS: Record<PlanPhase, string> = {
  idle: "plan.phaseIdle",
  planning: "plan.phasePlanning",
  reviewing: "plan.phaseReviewing",
  executing: "plan.phaseExecuting",
  done: "plan.phaseDone",
};

export function SessionCard({ session, onSelect, onDelete }: SessionCardProps) {
  const { t, i18n } = useTranslation();

  return (
    <Card
      className="group relative px-3.5 py-3 cursor-pointer hover:bg-accent/50 transition-colors duration-150"
      onClick={() => onSelect(session)}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(session.id);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <h3 className="font-semibold text-sm truncate pr-6">{session.name}</h3>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PHASE_COLORS[session.phase]}`} />
        <span className="text-xs text-muted-foreground">
          {t(PHASE_KEYS[session.phase])}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-2 text-right">
        {formatDistanceToNow(new Date(session.updated_at), {
          addSuffix: true,
          locale: getDateLocale(i18n.language),
        })}
      </div>
    </Card>
  );
}
