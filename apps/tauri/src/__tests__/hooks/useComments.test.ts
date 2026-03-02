import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useComments } from "@/hooks/useComments";

const mockInvoke = globalThis.__TAURI__.core.invoke as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "load_comments") {
      return Promise.resolve({ file_hash: "abc123", comments: [] });
    }
    if (cmd === "hash_file") return Promise.resolve("abc123");
    if (cmd === "save_comments") return Promise.resolve();
    return Promise.resolve();
  });
});

describe("useComments", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useComments());
    expect(result.current.comments).toEqual([]);
    expect(result.current.selectedBlockIds).toEqual([]);
    expect(result.current.isStale).toBe(false);
    expect(result.current.isPanelOpen).toBe(false);
    expect(result.current.unresolvedCount).toBe(0);
    expect(result.current.hoveredCommentId).toBeNull();
  });

  it("loads comments from backend", async () => {
    const storedComments = [
      { id: "1", block_ids: ["mkw-para-0"], text: "Fix this", timestamp: 1000, resolved: false },
    ];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "load_comments") {
        return Promise.resolve({ file_hash: "abc123", comments: storedComments });
      }
      if (cmd === "hash_file") return Promise.resolve("abc123");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    expect(result.current.comments).toEqual(storedComments);
    expect(result.current.isStale).toBe(false);
    expect(result.current.unresolvedCount).toBe(1);
  });

  it("auto-opens panel when loading unresolved comments", async () => {
    const storedComments = [
      { id: "1", block_ids: ["mkw-para-0"], text: "Fix this", timestamp: 1000, resolved: false },
    ];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "load_comments") {
        return Promise.resolve({ file_hash: "abc123", comments: storedComments });
      }
      if (cmd === "hash_file") return Promise.resolve("abc123");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useComments());

    expect(result.current.isPanelOpen).toBe(false);

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    expect(result.current.isPanelOpen).toBe(true);
  });

  it("does not auto-open panel when all comments are resolved", async () => {
    const storedComments = [
      { id: "1", block_ids: ["mkw-para-0"], text: "Done", timestamp: 1000, resolved: true },
    ];
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "load_comments") {
        return Promise.resolve({ file_hash: "abc123", comments: storedComments });
      }
      if (cmd === "hash_file") return Promise.resolve("abc123");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    expect(result.current.isPanelOpen).toBe(false);
  });

  it("detects stale state when hashes differ", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "load_comments") {
        return Promise.resolve({ file_hash: "old-hash", comments: [] });
      }
      if (cmd === "hash_file") return Promise.resolve("new-hash");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    expect(result.current.isStale).toBe(true);
  });

  it("toggles single block selection", () => {
    const { result } = renderHook(() => useComments());

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    expect(result.current.selectedBlockIds).toEqual(["mkw-para-0"]);

    act(() => {
      result.current.toggleBlockSelection("mkw-para-1", false);
    });
    expect(result.current.selectedBlockIds).toEqual(["mkw-para-1"]);
  });

  it("auto-opens panel when selecting a block", () => {
    const { result } = renderHook(() => useComments());

    expect(result.current.isPanelOpen).toBe(false);

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });

    expect(result.current.isPanelOpen).toBe(true);
  });

  it("toggles multi block selection with meta key", () => {
    const { result } = renderHook(() => useComments());

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", true);
    });
    expect(result.current.selectedBlockIds).toEqual(["mkw-para-0"]);

    act(() => {
      result.current.toggleBlockSelection("mkw-para-1", true);
    });
    expect(result.current.selectedBlockIds).toEqual(["mkw-para-0", "mkw-para-1"]);

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", true);
    });
    expect(result.current.selectedBlockIds).toEqual(["mkw-para-1"]);
  });

  it("clears selection", () => {
    const { result } = renderHook(() => useComments());

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    expect(result.current.selectedBlockIds).toEqual(["mkw-para-0"]);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedBlockIds).toEqual([]);
  });

  it("adds a comment and clears selection", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
      result.current.toggleBlockSelection("mkw-para-1", true);
    });

    act(() => {
      result.current.addComment("This needs revision");
    });

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].text).toBe("This needs revision");
    expect(result.current.comments[0].block_ids).toEqual(["mkw-para-0", "mkw-para-1"]);
    expect(result.current.comments[0].resolved).toBe(false);
    expect(result.current.selectedBlockIds).toEqual([]);
  });

  it("auto-opens panel when adding a comment", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    expect(result.current.isPanelOpen).toBe(false);

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    act(() => {
      result.current.addComment("New comment");
    });

    expect(result.current.isPanelOpen).toBe(true);
  });

  it("does not add comment when no blocks selected", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.addComment("No blocks");
    });

    expect(result.current.comments).toHaveLength(0);
  });

  it("resolves and unresolves a comment", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    act(() => {
      result.current.addComment("Fix");
    });

    const id = result.current.comments[0].id;
    expect(result.current.unresolvedCount).toBe(1);

    act(() => {
      result.current.resolveComment(id);
    });
    expect(result.current.comments[0].resolved).toBe(true);
    expect(result.current.unresolvedCount).toBe(0);

    act(() => {
      result.current.resolveComment(id);
    });
    expect(result.current.comments[0].resolved).toBe(false);
    expect(result.current.unresolvedCount).toBe(1);
  });

  it("deletes a comment", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    act(() => {
      result.current.addComment("To delete");
    });

    const id = result.current.comments[0].id;

    act(() => {
      result.current.deleteComment(id);
    });
    expect(result.current.comments).toHaveLength(0);
  });

  it("generates review for unresolved comments", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    act(() => {
      result.current.addComment("First comment");
    });

    const review = result.current.generateReview();
    expect(review).toContain("# Plan Review");
    expect(review).toContain("## Comment 1");
    expect(review).toContain("First comment");
  });

  it("generates empty review when all resolved", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    act(() => {
      result.current.addComment("Resolved");
    });

    const id = result.current.comments[0].id;
    act(() => {
      result.current.resolveComment(id);
    });

    const review = result.current.generateReview();
    expect(review).toContain("No unresolved comments");
  });

  it("toggles panel", () => {
    const { result } = renderHook(() => useComments());

    expect(result.current.isPanelOpen).toBe(false);
    act(() => {
      result.current.togglePanel();
    });
    expect(result.current.isPanelOpen).toBe(true);
    act(() => {
      result.current.togglePanel();
    });
    expect(result.current.isPanelOpen).toBe(false);
  });

  it("manages hoveredCommentId state", () => {
    const { result } = renderHook(() => useComments());

    expect(result.current.hoveredCommentId).toBeNull();

    act(() => {
      result.current.setHoveredCommentId("comment-1");
    });
    expect(result.current.hoveredCommentId).toBe("comment-1");

    act(() => {
      result.current.setHoveredCommentId(null);
    });
    expect(result.current.hoveredCommentId).toBeNull();
  });

  it("commentsByBlock filters correctly", async () => {
    const { result } = renderHook(() => useComments());

    await act(async () => {
      await result.current.loadComments("/test/file.md");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-0", false);
    });
    act(() => {
      result.current.addComment("Comment A");
    });

    act(() => {
      result.current.toggleBlockSelection("mkw-para-1", false);
    });
    act(() => {
      result.current.addComment("Comment B");
    });

    expect(result.current.commentsByBlock("mkw-para-0")).toHaveLength(1);
    expect(result.current.commentsByBlock("mkw-para-1")).toHaveLength(1);
    expect(result.current.commentsByBlock("mkw-para-2")).toHaveLength(0);
  });
});
