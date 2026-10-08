
export const RECENT_SEARCHES_STORAGE_KEY = 'social:recent-searches';

export const MAX_RECENT_SEARCHES = 6;

export function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((term): term is string => typeof term === 'string')
      .map(term => term.trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function rememberSearch(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return readRecentSearches();
  const next = [
    trimmed,
    ...readRecentSearches().filter(existing => existing.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, MAX_RECENT_SEARCHES);
  try {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
  } catch {
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
  }
}
