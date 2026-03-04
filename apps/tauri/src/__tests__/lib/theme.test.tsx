import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "@/lib/theme";

function mockMatchMedia(matches = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function ThemeHarness() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>light</button>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  vi.restoreAllMocks();
  mockMatchMedia(false);
});

describe("ThemeProvider", () => {
  it("applies the stored theme on mount", () => {
    mockMatchMedia(false);
    localStorage.setItem("test-theme", "dark");

    render(
      <ThemeProvider storageKey="test-theme">
        <ThemeHarness />
      </ThemeProvider>
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("writes to localStorage only when the active window changes theme", () => {
    mockMatchMedia(false);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const emitSpy = vi.spyOn(window.__TAURI__.event, "emit");

    render(
      <ThemeProvider storageKey="test-theme">
        <ThemeHarness />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "dark" }));

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith("test-theme", "dark");
    expect(emitSpy).toHaveBeenCalledWith("theme-changed", "dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("reacts to storage sync without echo-writing the same key", () => {
    mockMatchMedia(false);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const emitSpy = vi.spyOn(window.__TAURI__.event, "emit");

    render(
      <ThemeProvider storageKey="test-theme">
        <ThemeHarness />
      </ThemeProvider>
    );

    setItemSpy.mockClear();
    emitSpy.mockClear();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "test-theme",
          newValue: "dark",
        })
      );
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it("tracks system appearance changes while the preference is system", () => {
    let listener: (() => void) | null = null;
    let matches = false;

    window.matchMedia = vi.fn().mockImplementation(() => ({
      get matches() {
        return matches;
      },
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addListener: vi.fn((fn: () => void) => {
        listener = fn;
      }),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, fn: () => void) => {
        listener = fn;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      <ThemeProvider storageKey="test-theme" defaultTheme="system">
        <ThemeHarness />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");

    matches = true;
    act(() => {
      listener?.();
    });

    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});
