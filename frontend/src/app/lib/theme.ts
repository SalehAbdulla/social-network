export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'social:theme';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export function storeTheme(theme: Theme) {
  try {
    if (theme === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
  }
}

export const themeScript = `(function(){try{var s=window.localStorage.getItem('${THEME_STORAGE_KEY}');var t=s==='light'?'light':'dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.dataset.theme=t;}catch(e){}})();`;
