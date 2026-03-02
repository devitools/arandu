import type { Comment } from "@/types";
import { Button } from "@/components/ui/button";
import { blockLabel, scrollToBlock } from "@/lib/block-utils";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/date-locale";
import { Check, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CommentCardProps {
  comment: Comment;
  isStale: boolean;
  onResolve: (id: string) => void;
  onDelete: (id: string) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
}

export function CommentCard({
  comment,
  isStale,
  onResolve,
  onDelete,
  onHoverStart,
  onHoverEnd,
}: CommentCardProps) {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  return (
    <div
      className={`px-3 py-2.5 rounded-md border transition-colors ${
        comment.resolved
          ? "opacity-50 border-border"
          : isStale
            ? "border-dashed border-muted-foreground/40"
            : "border-border"
      }`}
      onMouseEnter={() => onHoverStart(comment.id)}
      onMouseLeave={onHoverEnd}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {comment.block_ids.map((id) => (
            <button
              key={id}
              onClick={() => scrollToBlock(id)}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {blockLabel(id)}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(comment.timestamp, {
            addSuffix: true,
            locale,
          })}
        </span>
      </div>

      <p
        className={`text-xs leading-relaxed mb-2 ${
          comment.resolved ? "line-through" : ""
        }`}
      >
        {comment.text}
      </p>

      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onResolve(comment.id)}
          title={comment.resolved ? t("review.unresolve") : t("review.resolve")}
        >
          {comment.resolved ? (
            <Undo2 className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onDelete(comment.id)}
          title={t("review.delete")}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
