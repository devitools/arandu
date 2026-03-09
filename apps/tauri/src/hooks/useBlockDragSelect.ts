import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseBlockDragSelectOptions {
  containerRef: RefObject<HTMLElement | null>;
  articleRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onSelectionEnd: (blockIds: string[]) => void;
}

const DRAG_THRESHOLD = 5;

function rectsIntersect(
  a: { top: number; left: number; bottom: number; right: number },
  b: { top: number; left: number; bottom: number; right: number }
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function useBlockDragSelect({
  containerRef,
  articleRef,
  enabled,
  onSelectionEnd,
}: UseBlockDragSelectOptions) {
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [previewBlockIds, setPreviewBlockIds] = useState<string[]>([]);

  const isDragging = useRef(false);
  const didDrag = useRef(false);
  const mouseDown = useRef(false);
  const startPoint = useRef({ x: 0, y: 0 });
  const previewRef = useRef<string[]>([]);
  const onSelectionEndRef = useRef(onSelectionEnd);
  onSelectionEndRef.current = onSelectionEnd;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select, [data-tauri-drag-region]")) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      startPoint.current = {
        x: e.clientX - containerRect.left + container.scrollLeft,
        y: e.clientY - containerRect.top + container.scrollTop,
      };
      mouseDown.current = true;
      isDragging.current = false;
      didDrag.current = false;
    },
    [enabled, containerRef]
  );

  const suppressClick = useCallback((e: MouseEvent) => {
    if (didDrag.current) {
      e.stopPropagation();
      e.preventDefault();
      didDrag.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDown.current) return;

      const containerRect = container.getBoundingClientRect();
      const currentX = e.clientX - containerRect.left + container.scrollLeft;
      const currentY = e.clientY - containerRect.top + container.scrollTop;

      const dx = currentX - startPoint.current.x;
      const dy = currentY - startPoint.current.y;

      if (!isDragging.current) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        isDragging.current = true;
        didDrag.current = true;
        document.body.style.userSelect = "none";
      }

      const rectX = Math.min(startPoint.current.x, currentX);
      const rectY = Math.min(startPoint.current.y, currentY);
      const rectW = Math.abs(dx);
      const rectH = Math.abs(dy);

      setSelectionRect({ x: rectX, y: rectY, width: rectW, height: rectH });

      const selectionAbsolute = {
        top: rectY,
        left: rectX,
        bottom: rectY + rectH,
        right: rectX + rectW,
      };

      const article = articleRef.current;
      if (!article) return;

      const blocks = article.querySelectorAll<HTMLElement>(".commentable-block");
      const intersected: string[] = [];

      blocks.forEach((block) => {
        if (!block.id) return;
        const blockRect = block.getBoundingClientRect();
        const blockAbsolute = {
          top: blockRect.top - containerRect.top + container.scrollTop,
          left: blockRect.left - containerRect.left + container.scrollLeft,
          bottom: blockRect.bottom - containerRect.top + container.scrollTop,
          right: blockRect.right - containerRect.left + container.scrollLeft,
        };

        if (rectsIntersect(selectionAbsolute, blockAbsolute)) {
          intersected.push(block.id);
        }
      });

      previewRef.current = intersected;
      setPreviewBlockIds(intersected);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.userSelect = "";

        setSelectionRect(null);
        const ids = [...previewRef.current];
        previewRef.current = [];
        setPreviewBlockIds([]);

        if (ids.length > 0) {
          onSelectionEndRef.current(ids);
        }
      }

      mouseDown.current = false;
    };

    container.addEventListener("click", suppressClick, true);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("click", suppressClick, true);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [enabled, containerRef, articleRef, suppressClick]);

  return { selectionRect, previewBlockIds, handleMouseDown };
}
