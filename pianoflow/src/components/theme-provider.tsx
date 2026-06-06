"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Briefly suppress CSS transitions while swapping themes so colors don't animate
// on toggle (mirrors next-themes' `disableTransitionOnChange`).
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none!important}"),
  );
  document.head.appendChild(style);

  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  // Force a reflow, then drop the override so later changes animate again.
  window.getComputedStyle(document.body);
  setTimeout(() => document.head.removeChild(style), 1);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR default is light; the inline head script may have already applied a
  // stored preference to <html>, which we reconcile into React state on mount.
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode / blocked) — keep the default.
    }
    // One-time post-mount sync of the stored preference into React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(stored === "dark" ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore persistence failures; the in-memory theme still applies.
    }
    applyTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme: theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: "light", resolvedTheme: "light", setTheme: () => {} };
  }
  return ctx;
}
