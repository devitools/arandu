import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
};

type ThemeProviderProps = {
  attribute?: "class";
  children: ReactNode;
  defaultTheme?: Theme;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  storageKey?: string;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    return isTheme(storedTheme) ? storedTheme : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"));
  document.head.appendChild(style);

  return () => {
    void window.getComputedStyle(document.body);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        style.remove();
      });
    });
  };
}

function applyTheme(resolvedTheme: ResolvedTheme, disableTransitionOnChange: boolean) {
  const cleanup = disableTransitionOnChange ? disableTransitionsTemporarily() : null;
  const root = document.documentElement;

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
  root.dataset.theme = resolvedTheme;

  cleanup?.();
}

export function ThemeProvider({
  attribute = "class",
  children,
  defaultTheme = "system",
  disableTransitionOnChange = false,
  enableSystem = true,
  storageKey = "theme",
}: ThemeProviderProps) {
  if (attribute !== "class") {
    throw new Error("ThemeProvider only supports attribute='class'.");
  }

  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme(storageKey, defaultTheme));
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === "system" && enableSystem) {
      return systemTheme;
    }

    return theme === "dark" ? "dark" : "light";
  }, [enableSystem, systemTheme, theme]);

  const setTheme = useCallback((nextTheme: Theme) => {
    if (!isTheme(nextTheme)) {
      return;
    }

    setThemeState((currentTheme) => {
      if (nextTheme === currentTheme) {
        return currentTheme;
      }

      try {
        window.localStorage.setItem(storageKey, nextTheme);
      } catch {
        // Ignore storage failures and still update the active window.
      }

      try {
        void window.__TAURI__.event.emit("theme-changed", nextTheme);
      } catch {
        // Ignore event bridge failures and keep local state in sync.
      }

      return nextTheme;
    });
  }, [storageKey]);

  useEffect(() => {
    applyTheme(resolvedTheme, disableTransitionOnChange);
  }, [disableTransitionOnChange, resolvedTheme]);

  useEffect(() => {
    if (!enableSystem || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MEDIA_QUERY);
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? "dark" : "light");
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [enableSystem]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;

      if (event.newValue === null) {
        setThemeState(defaultTheme);
        return;
      }

      if (isTheme(event.newValue)) {
        setThemeState(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [defaultTheme, storageKey]);

  useEffect(() => {
    const listen = window.__TAURI__?.event?.listen;
    if (typeof listen !== "function") {
      return undefined;
    }

    const unlisten = listen<Theme>("theme-changed", (event) => {
      if (isTheme(event.payload)) {
        setThemeState((currentTheme) => (currentTheme === event.payload ? currentTheme : event.payload));
      }
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    resolvedTheme,
    systemTheme,
  }), [resolvedTheme, setTheme, systemTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.");
  }

  return context;
}
