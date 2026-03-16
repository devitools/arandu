import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tauri-shim", () => {
  let originalTauri: Window["__TAURI__"] | undefined;

  beforeEach(() => {
    originalTauri = window.__TAURI__;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalTauri) {
      window.__TAURI__ = originalTauri;
    } else {
      delete (window as Partial<Window>).__TAURI__;
    }
  });

  it("creates a safe fallback when __TAURI__ is missing", async () => {
    delete (window as Partial<Window>).__TAURI__;

    await import("@/lib/tauri-shim");

    expect(window.__TAURI__).toBeDefined();
    expect(await window.__TAURI__.core.invoke("workspace_list")).toEqual([]);
    expect(await window.__TAURI__.core.invoke("get_home_dir")).toBeNull();
    expect(await window.__TAURI__.dialog.open()).toBeNull();
  });

  it("does not override an existing __TAURI__ object", async () => {
    const existing = {
      core: { invoke: vi.fn().mockResolvedValue("existing") },
      window: { getCurrentWindow: vi.fn() },
      dialog: { open: vi.fn() },
      event: {
        emit: vi.fn(),
        listen: vi.fn(),
      },
    } as unknown as Window["__TAURI__"];

    window.__TAURI__ = existing;

    await import("@/lib/tauri-shim");

    expect(window.__TAURI__).toBe(existing);
    expect(await window.__TAURI__.core.invoke("workspace_list")).toBe("existing");
  });
});
