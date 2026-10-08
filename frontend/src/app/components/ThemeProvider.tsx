'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DARK_MEDIA_QUERY, readStoredTheme, storeTheme, type Theme } from '../lib/theme';

interface ThemeSession {
  theme: Theme;
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
  const [theme, setThemeState] = useState<Theme>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

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
