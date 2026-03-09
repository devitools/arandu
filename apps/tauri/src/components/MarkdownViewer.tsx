import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ReviewPanel } from "@/components/ReviewPanel";
import { Button } from "@/components/ui/button";
import { AlertCircle, AlignLeft, MessageSquare, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useBlockDragSelect } from "@/hooks/useBlockDragSelect";
import { useComments } from "@/hooks/useComments";
import { shortenPath } from "@/lib/format-path";
import type { Heading } from "@/types";
import type { PlanPhase } from "@/types";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import "highlight.js/styles/github-dark.css";
import { useTranslation } from "react-i18next";
import { OutlineSidebar } from "./OutlineSidebar";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const COMMENTABLE_SELECTORS = "p, li, pre, blockquote";
const COMMENTABLE_PREFIX_MAP: Record<string, string> = {
  P: "para",
  LI: "list",
  PRE: "code",
  BLOCKQUOTE: "quote",
};

interface MarkdownViewerProps {
  filePath?: string;
  embedded?: boolean;
  phase?: PlanPhase;
  onApprovePlan?: (reviewMarkdown?: string) => void;
  onRequestChanges?: (feedback: string) => void;
}

export function MarkdownViewer({
  filePath: filePathProp,
  embedded,
  phase,
  onApprovePlan,
  onRequestChanges,
}: MarkdownViewerProps = {}) {
  const { t } = useTranslation();
  const { workspaces, expandedWorkspaceId, minimizeWorkspace } = useApp();
  const workspace = workspaces.find((w) => w.id === expandedWorkspaceId);

  const resolvedPath = filePathProp ?? (embedded ? null : workspace?.path ?? null);

  const [html, setHtml] = useState("");
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [loading, setLoading] = useState(!embedded);
  const [error, setError] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const OUTLINE_PINNED_KEY = "arandu-outline-pinned";
  const REVIEW_PINNED_KEY = "arandu-review-pinned";

  const [outlinePinned, setOutlinePinned] = useState(() => localStorage.getItem(OUTLINE_PINNED_KEY) === "true");
  const [reviewPinned, setReviewPinned] = useState(() => localStorage.getItem(REVIEW_PINNED_KEY) === "true");

  const toggleOutlinePin = useCallback(() => {
    setOutlinePinned((prev) => {
      const next = !prev;
      localStorage.setItem(OUTLINE_PINNED_KEY, String(next));
      return next;
    });
  }, []);

  const toggleReviewPin = useCallback(() => {
    setReviewPinned((prev) => {
      const next = !prev;
      localStorage.setItem(REVIEW_PINNED_KEY, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === OUTLINE_PINNED_KEY) {
        setOutlinePinned(event.newValue === "true");
      }
      if (event.key === REVIEW_PINNED_KEY) {
        setReviewPinned(event.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const review = useComments(workspace?.id);
  const prevPhaseRef = useRef<PlanPhase | undefined>(phase);

  const dragEnabled = !embedded || !!phase;
  const onDragSelectionEnd = useCallback(
    (blockIds: string[]) => {
      review.setBlockSelection(blockIds);
      setReviewOpen(true);
    },
    [review.setBlockSelection]
  );
  const dragSelect = useBlockDragSelect({
    containerRef: scrollRef,
    articleRef,
    enabled: dragEnabled,
    onSelectionEnd: onDragSelectionEnd,
  });

  const loadContent = useCallback(async (path: string) => {
    try {
      setError(null);
      const content = await invoke<string>("read_file", { path });
      const rendered = await invoke<string>("render_markdown", { content });
      const extractedHeadings = await invoke<Heading[]>("extract_headings", { markdown: content });

      setHtml(rendered);
      setHeadings(extractedHeadings);
      setLoading(false);
    } catch (err) {
      if (!embedded) {
        setError(String(err));
      }
      setLoading(false);
    }
  }, [embedded]);

  useEffect(() => {
    if (!resolvedPath) return;

    if (!embedded) setLoading(true);
    loadContent(resolvedPath);
    review.loadComments(resolvedPath);

    invoke("watch_file", { path: resolvedPath }).catch(console.error);

    const unlistenPromise = listen<string>("file-changed", (event) => {
      if (!resolvedPath) return;
      const changedPath = event.payload;
      if (changedPath === resolvedPath || changedPath.endsWith(resolvedPath.split("/").pop() || "")) {
        loadContent(resolvedPath);
        review.refreshHash();
      }
    });

    return () => {
      invoke("unwatch_file", { path: resolvedPath }).catch(console.error);
      unlistenPromise.then((fn) => fn());
    };
  }, [resolvedPath, loadContent, review.loadComments, review.refreshHash, embedded]);

  useEffect(() => {
    if (!html || !articleRef.current) return;

    const article = articleRef.current;

    const renderedHeadings = article.querySelectorAll("h1, h2, h3, h4, h5, h6");
    renderedHeadings.forEach((heading, idx) => {
      if (headings[idx]) {
        heading.id = `mkw-heading-${headings[idx].index}`;
        heading.classList.add("commentable-block");
      }
    });

    const counters: Record<string, number> = {};
    article.querySelectorAll(COMMENTABLE_SELECTORS).forEach((el) => {
      const tag = el.tagName;
      const prefix = COMMENTABLE_PREFIX_MAP[tag];
      if (!prefix) return;
      if (el.closest("li") && tag !== "LI") return;
      counters[prefix] = (counters[prefix] || 0);
      el.id = `mkw-${prefix}-${counters[prefix]}`;
      el.classList.add("commentable-block");
      counters[prefix]++;
    });

    article.querySelectorAll<HTMLElement>("pre code").forEach((block) => {
      if (!block.dataset.highlighted) {
        hljs.highlightElement(block);
      }
    });
  }, [html, headings]);

  useEffect(() => {
    if (!articleRef.current) return;

    const article = articleRef.current;
    const blocks = article.querySelectorAll(".commentable-block");

    const hoveredComment = review.hoveredCommentId
      ? review.comments.find((c) => c.id === review.hoveredCommentId)
      : null;

    blocks.forEach((block) => {
      block.classList.toggle("selected", review.selectedBlockIds.includes(block.id));
      block.classList.toggle("drag-preview", dragSelect.previewBlockIds.includes(block.id));

      const blockComments = review.commentsByBlock(block.id);
      const commentCount = blockComments.length;
      const hasComment = commentCount > 0;
      block.classList.toggle("has-comment", hasComment);
      block.classList.toggle("stale", hasComment && review.isStale);

      const existingBadge = block.querySelector(".comment-badge") as HTMLElement | null;
      if (commentCount > 0) {
        if (existingBadge) {
          const countEl = existingBadge.querySelector(".comment-badge-count");
          if (countEl) countEl.textContent = String(commentCount);
          existingBadge.classList.remove("comment-badge--selection");
        } else {
          const badge = document.createElement("button");
          badge.className = "comment-badge";
          badge.dataset.blockId = block.id;
          badge.innerHTML =
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            `<span class="comment-badge-count">${commentCount}</span>`;
          block.appendChild(badge);
        }
      } else {
        const isSelected = review.selectedBlockIds.includes(block.id);
        const selBadge = existingBadge?.classList.contains("comment-badge--selection") ? existingBadge : null;
        if (isSelected) {
          if (!selBadge) {
            if (existingBadge) existingBadge.remove();
            const badge = document.createElement("button");
            badge.className = "comment-badge comment-badge--selection";
            badge.dataset.blockId = block.id;
            badge.innerHTML =
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
            block.appendChild(badge);
          }
        } else if (existingBadge) {
          existingBadge.remove();
        }
      }

      const isHighlighted = hoveredComment?.block_ids.includes(block.id) ?? false;
      block.classList.toggle("highlighted-from-panel", isHighlighted);
    });

    const activeBlocks = article.querySelectorAll<HTMLElement>(
      ".commentable-block:is(.selected, .drag-preview, .highlighted-from-panel)"
    );
    const gutterBlocks = article.querySelectorAll<HTMLElement>(
      ".commentable-block:is(.selected, .drag-preview)"
    );

    blocks.forEach((b) => {
      b.classList.remove("merge-bottom", "merge-top", "gutter-merge-bottom", "gutter-merge-top");
      const el = b as HTMLElement;
      el.style.removeProperty("--merge-gap-above");
      el.style.removeProperty("--merge-gap-below");
      el.style.removeProperty("--gutter-gap-above");
      el.style.removeProperty("--gutter-gap-below");
    });

    for (let i = 0; i < activeBlocks.length - 1; i++) {
      const a = activeBlocks[i].getBoundingClientRect();
      const b = activeBlocks[i + 1].getBoundingClientRect();
      const gap = b.top - a.bottom;
      if (gap >= 0 && gap < 48) {
        activeBlocks[i].classList.add("merge-bottom");
        activeBlocks[i + 1].classList.add("merge-top");
        if (gap > 0) {
          activeBlocks[i].style.setProperty("--merge-gap-below", `${gap}px`);
          activeBlocks[i + 1].style.setProperty("--merge-gap-above", `${gap}px`);
        }
      }
    }

    for (let i = 0; i < gutterBlocks.length - 1; i++) {
      const a = gutterBlocks[i].getBoundingClientRect();
      const b = gutterBlocks[i + 1].getBoundingClientRect();
      const gap = b.top - a.bottom;
      if (gap >= 0 && gap < 48) {
        gutterBlocks[i].classList.add("gutter-merge-bottom");
        gutterBlocks[i + 1].classList.add("gutter-merge-top");
        if (gap > 0) {
          gutterBlocks[i].style.setProperty("--gutter-gap-below", `${gap}px`);
          gutterBlocks[i + 1].style.setProperty("--gutter-gap-above", `${gap}px`);
        }
      }
    }
  }, [review.selectedBlockIds, review.comments, review.commentsByBlock, review.hoveredCommentId, review.isStale, dragSelect.previewBlockIds]);

  const handleBlockClick = useCallback(
    (e: React.MouseEvent) => {
      if (embedded && !phase) return;
      const target = e.target as HTMLElement;

      const badge = target.closest(".comment-badge") as HTMLElement | null;
      if (badge) {
        e.stopPropagation();
        setReviewOpen(true);
        review.setIsPanelOpen(true);
        return;
      }

      const block = target.closest(".commentable-block");
      if (!block || !block.id) {
        review.clearSelection();
        return;
      }

      review.toggleBlockSelection(block.id, e.metaKey || e.ctrlKey);
    },
    [embedded, phase, review.toggleBlockSelection, review.clearSelection]
  );

  useEffect(() => {
    if (!embedded) {
      setReviewOpen(false);
    }
  }, [resolvedPath, embedded]);

  useEffect(() => {
    const enteringReview = prevPhaseRef.current !== "reviewing" && phase === "reviewing";
    if (embedded && enteringReview) {
      setReviewOpen(true);
    }
    if (!embedded && review.isPanelOpen) {
      setReviewOpen(true);
    }
    prevPhaseRef.current = phase;
  }, [phase, review.isPanelOpen, embedded]);

  const handleApprove = useCallback(() => {
    if (!onApprovePlan) return;
    const reviewText = review.generateReview();
    const hasComments = review.comments.some((c) => !c.resolved);
    review.resolveAll();
    setReviewOpen(false);
    review.setIsPanelOpen(false);
    onApprovePlan(hasComments ? reviewText : undefined);
  }, [review.generateReview, review.comments, review.resolveAll, review.setIsPanelOpen, onApprovePlan]);

  // --- Embedded mode (session plan) ---
  if (embedded) {
    if (!resolvedPath && phase === "idle") {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-muted-foreground/50 font-mono text-sm">
            {t("plan.emptyState")}
          </p>
        </div>
      );
    }

    return renderContent();
  }

  // --- Standalone mode (file viewer) ---
  if (!workspace) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" text={t("common.loading")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        <div className="h-14 border-b border-border px-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{workspace.displayName}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={minimizeWorkspace}
            className="h-8 w-8"
            title={t("common.minimize")}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <p className="text-lg font-semibold text-destructive">{t("document.errorTitle")}</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">{error}</p>
          <Button variant="outline" onClick={() => resolvedPath && loadContent(resolvedPath)}>
            {t("common.tryAgain")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background min-h-0">
      <div className="h-14 border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-lg">{workspace.displayName}</h2>
          <span className="text-sm text-muted-foreground truncate" dir="rtl" title={workspace.path}>
            <bdi>{shortenPath(workspace.path)}</bdi>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const next = !reviewOpen;
              setReviewOpen(next);
              review.setIsPanelOpen(next);
            }}
            className="h-8 w-8 relative"
            title={t("review.togglePanel")}
          >
            <MessageSquare className="h-4 w-4" />
            {review.unresolvedCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold bg-foreground text-background flex items-center justify-center">
                {review.unresolvedCount}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={minimizeWorkspace}
            className="h-8 w-8"
            title={t("common.minimize")}
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {renderContent()}
    </div>
  );

  function renderContent() {
    const isEmbedded = !!embedded;
    const outlineDockedOpen = outlinePinned && outlineOpen && headings.length > 0;
    const outlineFloatingOpen = !outlinePinned && outlineOpen && headings.length > 0;
    const reviewDockedOpen = reviewPinned && reviewOpen;
    const reviewFloatingOpen = !reviewPinned && reviewOpen;

    const reviewPanelElement = (
      <ReviewPanel
        comments={review.comments}
        selectedBlockIds={review.selectedBlockIds}
        isStale={review.isStale}
        unresolvedCount={review.unresolvedCount}
        pinned={reviewPinned}
        onTogglePin={toggleReviewPin}
        onClose={() => { setReviewOpen(false); review.setIsPanelOpen(false); }}
        onAddComment={review.addComment}
        onResolveComment={review.resolveComment}
        onDeleteComment={review.deleteComment}
        onHoverComment={review.setHoveredCommentId}
        onCancelComment={review.clearSelection}
        generateReview={review.generateReview}
        onApprovePlan={onApprovePlan ? handleApprove : undefined}
        onRequestChanges={onRequestChanges}
      />
    );

    return (
      <div className={`flex flex-row ${isEmbedded ? "h-full" : "flex-1 min-h-0"}`}>
        {/* Docked outline (left) */}
        {outlineDockedOpen && (
          <div className="w-[360px] shrink-0 border-r border-border bg-card">
            <OutlineSidebar
              headings={headings}
              pinned={outlinePinned}
              onTogglePin={toggleOutlinePin}
              onClose={() => setOutlineOpen(false)}
            />
          </div>
        )}

        {/* Center content area */}
        <div className="relative flex-1 min-w-0 overflow-hidden">
          {/* Scroll content */}
          <div
            ref={scrollRef}
            className="absolute inset-0 overflow-auto bg-background"
            onClick={handleBlockClick}
            onMouseDown={dragSelect.handleMouseDown}
          >
            {dragSelect.selectionRect && (
              <div
                className="block-selection-rect"
                style={{
                  left: dragSelect.selectionRect.x,
                  top: dragSelect.selectionRect.y,
                  width: dragSelect.selectionRect.width,
                  height: dragSelect.selectionRect.height,
                }}
              />
            )}
            <div className="max-w-4xl mx-auto p-8">
              {/* Safe: html is produced by comrak (Rust GFM renderer) from local files only */}
              <article
                ref={articleRef}
                className="prose prose-slate dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>

          {/* Outline toggle button */}
          {!outlineOpen && headings.length > 0 && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOutlineOpen(true)}
              className="absolute top-3 left-3 z-20 h-8 w-8 text-muted-foreground hover:text-foreground shadow-sm"
              title={t("outline.title")}
              aria-label={t("outline.title")}
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
          )}

          {/* Review toggle button */}
          {!reviewOpen && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => { setReviewOpen(true); review.setIsPanelOpen(true); }}
              className="absolute top-3 right-5 z-20 h-8 w-8 text-muted-foreground hover:text-foreground shadow-sm"
              title={t("review.togglePanel")}
              aria-label={t("review.togglePanel")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {review.unresolvedCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold bg-foreground text-background flex items-center justify-center">
                  {review.unresolvedCount}
                </span>
              )}
            </Button>
          )}

          {/* Floating outline overlay */}
          {outlineFloatingOpen && (
            <div className="absolute left-0 top-0 h-full w-[360px] z-20 shadow-lg border-r border-border bg-card">
              <OutlineSidebar
                headings={headings}
                pinned={outlinePinned}
                onTogglePin={toggleOutlinePin}
                onClose={() => setOutlineOpen(false)}
              />
            </div>
          )}

          {/* Floating review overlay */}
          {reviewFloatingOpen && (
            <div className="absolute right-0 top-0 h-full w-[440px] z-20 shadow-lg border-l border-border">
              {reviewPanelElement}
            </div>
          )}
        </div>

        {/* Docked review (right) */}
        {reviewDockedOpen && (
          <div className="w-[440px] shrink-0 border-l border-border">
            {reviewPanelElement}
          </div>
        )}
      </div>
    );
  }
}
