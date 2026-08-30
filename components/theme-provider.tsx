"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * ThemeProvider persists the user's theme preference to localStorage and
 * applies/removes the `.dark` class on <html>. Defaults to "dark" so the
 * initial server render always matches the base theme (avoids flash).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const initialized = useRef(false);

  // The inline head script applies the saved class before paint. Mirror that
  // value into React once mounted without overwriting it on the first effect.
  useEffect(() => {
    const root = document.documentElement;
    const initialTheme: Theme = root.classList.contains("dark") ? "dark" : "light";
    initialized.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("resonance-theme", theme);
    } catch {
      // Storage can be unavailable in hardened browsing modes.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
