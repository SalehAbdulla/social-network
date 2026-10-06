/**
 * Theme preference shared by the pre-paint script and the React provider.
 *
 * The choice is deliberately client-only: the inline script in `layout.tsx`
 * reads `localStorage` while the browser parses the document and puts
 * `class="dark"` on `<html>` before the first paint, and `ThemeProvider` keeps
 * that class in sync from then on.
 */
export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'social:theme';

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** The stored preference. `dark` is the default — the app is drawn the way Instagram's is — and
 * the switch still offers light to anyone who wants it. */
export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): the default still applies.
    return 'dark';
  }
}

/** Persist an explicit choice; `system` clears it so the OS takes over again. */
export function storeTheme(theme: Theme) {
  try {
    if (theme === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A blocked storage API only costs persistence, not the theme for this session.
  }
}

/**
 * Runs as the first thing in `<head>`, so the correct theme is on `<html>`
 * before any content is painted. It mirrors `readStoredTheme` and the
 * resolution in `ThemeProvider`, which is why the key and the media query are
 * interpolated instead of repeated as literals.
 */
export const themeScript = `(function(){try{var s=window.localStorage.getItem('${THEME_STORAGE_KEY}');var t=s==='light'?'light':'dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.dataset.theme=t;}catch(e){}})();`;
