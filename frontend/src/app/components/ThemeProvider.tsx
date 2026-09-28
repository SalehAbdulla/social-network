'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DARK_MEDIA_QUERY, readStoredTheme, storeTheme, type Theme } from '../lib/theme';

interface ThemeSession {
  /** The stored preference: `system` follows the operating system. */
  theme: Theme;
  /** `theme` with `system` resolved against `prefers-color-scheme`. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}
const Context = createContext<ThemeSession | null>(null);

export function useTheme() {
  const value = useContext(Context);
  if (!value) throw new Error('ThemeProvider is required');
  return value;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  // State starts as `system` + light so the SSR markup and the hydration render
  // agree; the stored choice is read from the effect below. That is exactly why
  // the switch gets its looks from CSS (`dark:` variants) instead of this state.
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Reading storage and the media query means touching the browser, so it is
  // deferred to a task like the rest of this codebase does. `mounted` gates the
  // class sync below until the stored preference is known.
  useEffect(() => {
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const sync = () => setSystemDark(query.matches);
    const timer = setTimeout(() => {
      setThemeState(readStoredTheme());
      setMounted(true);
      sync();
    }, 0);
    query.addEventListener('change', sync);
    return () => { clearTimeout(timer); query.removeEventListener('change', sync); };
  }, []);

  useEffect(() => {
    // The inline script in layout.tsx already put the right class on <html>, so
    // this effect must not run before the stored preference is known: writing
    // `light` first would undo the script and flash a light page for dark users.
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.theme = resolvedTheme;
  }, [mounted, resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next);
    setThemeState(next);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
