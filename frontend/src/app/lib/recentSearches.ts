/**
 * The terms this browser has searched for, newest first.
 *
 * It lives where the reader can see and clear it — the search page draws them as
 * chips — rather than on the server: nothing here leaves the browser. Storage is
 * best-effort in the same way as `lib/theme.ts` and `lib/postDraft.ts`, so a blocked
 * or full store costs the list, never the search itself.
 */

export const RECENT_SEARCHES_STORAGE_KEY = 'social:recent-searches';

/** Past a handful they stop being the "recent" ones and start being a list. */
export const MAX_RECENT_SEARCHES = 6;

/**
 * The stored list, or an empty one when there is nothing usable. Every entry is
 * re-validated rather than trusted: it can have been written by an older version of
 * this app or edited by hand, and a search page that throws on mount because of one
 * bad entry is worse than one that starts with no chips.
 */
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
    // Unreadable storage or unparsable JSON: no chips rather than a broken page.
    return [];
  }
}

/**
 * Records a term at the front of the list and answers with the new list, so the
 * caller renders the chips without reading storage back. A repeat moves the term
 * rather than duplicating it, compared without case because that is how the search
 * itself treats it.
 */
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
    // The chips still render for this visit.
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
    // Nothing to undo: the list simply stays until it is written again.
  }
}
