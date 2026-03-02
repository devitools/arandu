import type { Comment } from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CommentCard } from "@/components/CommentCard";
import { MicButton } from "@/components/MicButton";
import { blockLabel } from "@/lib/block-utils";
import { AlertTriangle, ArrowLeft, Check, Copy, Eye, EyeOff, FileText, MessageSquare, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const { invoke } = window.__TAURI__.core;

interface ReviewPanelProps {
  comments: Comment[];
  selectedBlockIds: string[];
  isStale: boolean;
  unresolvedCount: number;
  onClose: () => void;
  onAddComment: (text: string) => void;
  onResolveComment: (id: string) => void;
  onDeleteComment: (id: string) => void;
  onHoverComment: (id: string | null) => void;
  onCancelComment: () => void;
  generateReview: () => string;
  onApprovePlan?: () => void;
  onRequestChanges?: (feedback: string) => void;
}

export function ReviewPanel({
  comments,
  selectedBlockIds,
  isStale,
  unresolvedCount,
  onClose,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  onHoverComment,
  onCancelComment,
  generateReview,
  onApprovePlan,
  onRequestChanges,
}: ReviewPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"comments" | "review">("comments");
  const [commentText, setCommentText] = useState("");
  const [reviewContent, setReviewContent] = useState("");
  const [hideResolved, setHideResolved] = useState(true);

  const isSessionMode = !!onApprovePlan;
  const visibleComments = hideResolved ? comments.filter((c) => !c.resolved) : comments;

  const handleSubmit = () => {
    if (!commentText.trim()) return;
    onAddComment(commentText);
    setCommentText("");
  };

  const handleGenerateReview = () => {
    setReviewContent(generateReview());
    setMode("review");
  };

  const handleCopy = async () => {
    try {
      await invoke("write_clipboard", { text: reviewContent });
      toast.success(t("review.copied"));
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (mode === "review") {
    return (
      <div className="h-full flex flex-col bg-card">
        <div className="p-4 flex items-center justify-between border-b border-border shrink-0">
          <button
            onClick={() => setMode("comments")}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("review.backToComments")}
          </button>
        </div>

        <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">
            {t("review.reviewTitle")}
          </h3>
          <Textarea
            value={reviewContent}
            onChange={(e) => setReviewContent(e.target.value)}
            className="flex-1 font-mono text-xs resize-none"
          />
        </div>

        <div className="p-3 border-t border-border shrink-0 flex items-center gap-2">
          <Button onClick={handleCopy} className="flex-1" size="sm">
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {t("review.copyToClipboard")}
          </Button>
          <MicButton size="sm" onTranscriptionComplete={(text) => setReviewContent((prev) => prev + text)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">
            {t("review.panelTitle")}
          </h3>
          {unresolvedCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-foreground text-background">
              {unresolvedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-6 w-6 ${hideResolved ? "text-foreground" : "text-muted-foreground"}`}
            onClick={() => setHideResolved((prev) => !prev)}
            title={t(hideResolved ? "review.showResolved" : "review.hideResolved")}
          >
            {hideResolved ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stale warning */}
      {isStale && (
        <div className="px-3 py-2 bg-muted flex items-center gap-2 text-xs text-muted-foreground border-b border-border shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t("review.staleWarning")}
        </div>
      )}

      {/* Comment list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-2">
          {visibleComments.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {hideResolved && comments.length > 0
                ? t("review.allResolved")
                : t("review.noComments")}
            </div>
          ) : (
            visibleComments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                isStale={isStale}
                onResolve={onResolveComment}
                onDelete={onDeleteComment}
                onHoverStart={(id) => onHoverComment(id)}
                onHoverEnd={() => onHoverComment(null)}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border shrink-0">
        {selectedBlockIds.length > 0 ? (
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">
                {t("review.commentingOn")}
              </span>
              {selectedBlockIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground"
                >
                  {blockLabel(id)}
                </span>
              ))}
            </div>
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("review.commentPlaceholder")}
              className="min-h-[100px] max-h-[200px] text-xs resize-y"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <MicButton size="sm" onTranscriptionComplete={(text) => setCommentText((prev) => prev + text)} />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => { setCommentText(""); onCancelComment(); }}
              >
                {t("review.cancel")}
              </Button>
              <Button
                size="sm"
                className="text-xs"
                onClick={handleSubmit}
                disabled={!commentText.trim()}
              >
                {t("review.submit")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground text-center py-1">
              {t("review.selectBlocksHint")}
            </p>
            {isSessionMode ? (
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={() => {
                    const reviewText = generateReview();
                    const hasComments = comments.some((c) => !c.resolved);
                    onRequestChanges?.(hasComments ? reviewText : t("plan.requestChangesDefault"));
                  }}
                  disabled={unresolvedCount === 0}
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  {t("plan.requestChanges")}
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={onApprovePlan}
                >
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {t("plan.approve")}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                disabled={unresolvedCount === 0}
                onClick={handleGenerateReview}
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                {t("review.generateAndPreview")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
