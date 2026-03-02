import type { Comment, CommentsData } from "@/types";
import { useCallback, useRef, useState } from "react";

const { invoke } = window.__TAURI__.core;

export function useComments() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [fileHash, setFileHash] = useState("");
  const [savedHash, setSavedHash] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const pathRef = useRef("");
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const isStale = savedHash !== "" && fileHash !== "" && savedHash !== fileHash;

  const unresolvedCount = comments.filter((c) => !c.resolved).length;

  const enqueueSave = useCallback((updatedComments: Comment[]) => {
    saveQueue.current = saveQueue.current.then(async () => {
      if (!pathRef.current) return;
      const hash = await invoke<string>("hash_file", { path: pathRef.current });
      const data: CommentsData = {
        file_hash: hash,
        comments: updatedComments,
      };
      await invoke("save_comments", {
        markdownPath: pathRef.current,
        commentsData: data,
      });
      setSavedHash(hash);
    }).catch(console.error);
  }, []);

  const loadComments = useCallback(async (path: string) => {
    pathRef.current = path;
    try {
      const [data, hash] = await Promise.all([
        invoke<CommentsData>("load_comments", { markdownPath: path }),
        invoke<string>("hash_file", { path }),
      ]);
      setComments(data.comments);
      setFileHash(hash);
      setSavedHash(data.file_hash);

      const hasUnresolved = data.comments.some((c) => !c.resolved);
      if (hasUnresolved) {
        setIsPanelOpen(true);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  }, []);

  const refreshHash = useCallback(async () => {
    if (!pathRef.current) return;
    try {
      const hash = await invoke<string>("hash_file", { path: pathRef.current });
      setFileHash(hash);
    } catch (err) {
      console.error("Failed to refresh hash:", err);
    }
  }, []);

  const addComment = useCallback((text: string) => {
    if (selectedBlockIds.length === 0 || !text.trim()) return;
    const comment: Comment = {
      id: crypto.randomUUID(),
      block_ids: [...selectedBlockIds],
      text: text.trim(),
      timestamp: Date.now(),
      resolved: false,
    };
    setComments((prev) => {
      const next = [...prev, comment];
      enqueueSave(next);
      return next;
    });
    setSelectedBlockIds([]);
    setIsPanelOpen(true);
  }, [selectedBlockIds, enqueueSave]);

  const resolveComment = useCallback((id: string) => {
    setComments((prev) => {
      const next = prev.map((c) =>
        c.id === id ? { ...c, resolved: !c.resolved } : c
      );
      enqueueSave(next);
      return next;
    });
  }, [enqueueSave]);

  const resolveAll = useCallback(() => {
    setComments((prev) => {
      const next = prev.map((c) => (c.resolved ? c : { ...c, resolved: true }));
      enqueueSave(next);
      return next;
    });
  }, [enqueueSave]);

  const deleteComment = useCallback((id: string) => {
    setComments((prev) => {
      const next = prev.filter((c) => c.id !== id);
      enqueueSave(next);
      return next;
    });
  }, [enqueueSave]);

  const toggleBlockSelection = useCallback((blockId: string, multiSelect: boolean) => {
    setSelectedBlockIds((prev) => {
      const next = multiSelect
        ? prev.includes(blockId)
          ? prev.filter((id) => id !== blockId)
          : [...prev, blockId]
        : prev.includes(blockId) && prev.length === 1
          ? []
          : [blockId];

      if (next.length > 0) {
        setIsPanelOpen(true);
      }

      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedBlockIds([]);
  }, []);

  const generateReview = useCallback((): string => {
    const unresolved = comments.filter((c) => !c.resolved);
    if (unresolved.length === 0) {
      return "# Plan Review\n\nNo unresolved comments. All feedback has been addressed.";
    }

    const sections = unresolved.map((comment, idx) => {
      const blockContents = comment.block_ids.map((blockId) => {
        const el = document.getElementById(blockId);
        const text = el?.textContent?.trim() || "";
        return text.length > 200 ? `${text.slice(0, 200)}...` : text;
      });
      const quoted = blockContents
        .filter(Boolean)
        .map((t) => t.split("\n").map((line) => `> ${line}`).join("\n"))
        .join("\n>\n");

      return `## Comment ${idx + 1}\nAbout the block(s):\n${quoted}\n\nMessage: ${comment.text}`;
    });

    return `# Plan Review\n\n${sections.join("\n\n")}`;
  }, [comments]);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  const commentsByBlock = useCallback((blockId: string): Comment[] => {
    return comments.filter((c) => c.block_ids.includes(blockId) && !c.resolved);
  }, [comments]);

  return {
    comments,
    selectedBlockIds,
    isStale,
    isPanelOpen,
    unresolvedCount,
    hoveredCommentId,
    setIsPanelOpen,
    setHoveredCommentId,
    loadComments,
    refreshHash,
    addComment,
    resolveComment,
    resolveAll,
    deleteComment,
    toggleBlockSelection,
    clearSelection,
    generateReview,
    togglePanel,
    commentsByBlock,
  };
}
