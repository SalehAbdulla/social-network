'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isUnauthorized, request } from '../api/social';
import { notifyError } from './notify';

/**
 * Minimum gap between two page requests for the same list, in milliseconds.
 *
 * Scroll events fire far faster than a page of cards can be painted, so a fling
 * on touch or a fast scroll wheel would otherwise queue the same page several
 * times. Requests made inside the window are coalesced into the pending one,
 * which is why callers only ever pass a page number and never a page size.
 */
const MIN_REQUEST_GAP = 350;

export interface PageInfo {
  /** 1-based page that was requested. */
  page: number;
  /** Rows the caller expects per page; `pageQuery` must agree with it. */
  pageSize: number;
}

export interface PagedListOptions<T, R> {
  /**
   * Stable identity of the current filter set (path plus query, minus the page
   * parameter). Changing it restarts the list at page 1 and drops the rows that
   * belonged to the previous filters.
   */
  key: string;
  /** Query fragment appended after `key` for a page, e.g. `&page=3` or `&offset=60`. */
  pageQuery: (page: number) => string;
  /** Rows per page. Also the fallback used to detect the end of the list. */
  pageSize: number;
  /**
   * Flattens a response into rows, plus an explicit end-of-list flag when the
   * endpoint reports one (`lastPage`, `totalElements`, …). Without the flag the
   * hook falls back to "a page shorter than `pageSize` is the last page".
   */
  normalize: (raw: R, info: PageInfo) => { items: T[]; hasMore?: boolean };
  /** Identity of a row, used to drop rows that a new page repeats. */
  keyOf: (item: T) => string | number;
  /** Pause the list entirely (e.g. a private profile the viewer cannot read). */
  enabled?: boolean;
}

interface PagedListState<T> {
  key: string;
  items: T[];
  hasMore: boolean;
  /** A request for the first page is in flight. */
  loading: boolean;
  /** A follow-up page is in flight. */
  loadingMore: boolean;
  error: string;
}

const EMPTY: PagedListState<never> = { key: '', items: [], hasMore: true, loading: false, loadingMore: false, error: '' };

function dedupe<T>(items: T[], keyOf: (item: T) => string | number): T[] {
  if (items.length < 2) return items;
  const seen = new Set<string | number>();
  return items.filter(item => {
    const id = keyOf(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Pages an offset- or page-based collection into one growing list.
 *
 * The list is meant to be driven by `LoadMore`, which requests the next page as
 * the end of the list scrolls into view. Only one page is ever in flight, the
 * rows already on screen stay visible while the next page loads, and rows are
 * de-duplicated so an item created between two requests cannot render twice.
 */
export function usePagedList<T, R>(options: PagedListOptions<T, R>) {
  const { key, enabled = true } = options;

  // `pageQuery`, `normalize` and `keyOf` are normally inline arrows, so they are
  // read through a ref instead of participating in dependency comparison. Every
  // one of them is derived from `key`, and this sync effect is declared first so
  // it has already run by the time the fetch effect below reads the ref.
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });

  const [state, setState] = useState<PagedListState<T>>(EMPTY);
  const [revision, setRevision] = useState(0);

  // Control flow lives in a ref: the cursor, the in-flight guard and the
  // throttle clock must be readable synchronously from an event handler.
  const cursor = useRef({ key: '', page: 0, hasMore: true, busy: false, lastRequest: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => setRevision(value => value + 1), []);

  const fetchPage = useCallback(async (page: number, mode: 'reset' | 'append' | 'merge', requestKey: string) => {
    // A background refresh never reports progress: the rows on screen stay put.
    const background = mode === 'merge';
    const abort = new AbortController();
    // A reset supersedes whatever was in flight: those rows belong to filters
    // the viewer has already left.
    if (mode === 'reset') abortRef.current?.abort();
    abortRef.current = abort;
    cursor.current.busy = true;
    setState(current => mode === 'reset'
      // Re-fetching the same filters keeps the rows on screen, so a reload after
      // creating a post never blanks the feed. New filters start from empty.
      ? { key: requestKey, items: current.key === requestKey ? current.items : [], hasMore: true, loading: true, loadingMore: false, error: '' }
      : mode === 'append'
        ? { ...current, loadingMore: true, error: '' }
        : current);
    try {
      const { pageQuery, normalize, pageSize: size } = latest.current;
      const raw = await request<R>(requestKey + pageQuery(page), 'GET', undefined, abort.signal);
      if (abort.signal.aborted) return;
      const { items, hasMore } = normalize(raw, { page, pageSize: size });
      // A merge only replaces the newest page: the cursor keeps pointing at the
      // old end of the list so the next "load more" still asks for the next page.
      if (!background) cursor.current.page = page;
      cursor.current.hasMore = hasMore ?? items.length >= size;
      const more = cursor.current.hasMore;
      setState(current => ({
        key: requestKey,
        items: dedupe(mode === 'append' ? [...current.items, ...items] : mode === 'merge' ? [...items, ...current.items] : items, latest.current.keyOf),
        hasMore: more,
        loading: false,
        loadingMore: false,
        error: '',
      }));
    } catch (error) {
      if (abort.signal.aborted) return;
      const message = errorMessage(error);
      if (!background) cursor.current.hasMore = false;
      setState(current => background
        ? current
        : { ...current, key: requestKey, hasMore: false, loading: false, loadingMore: false, error: message });
      // A 401 already redirects to the login page, so a toast would only add noise there.
      if (!isUnauthorized(error)) notifyError(message, () => setRevision(value => value + 1));
    } finally {
      if (abortRef.current === abort) {
        cursor.current.busy = false;
        cursor.current.lastRequest = Date.now();
      }
    }
  }, []);

  useEffect(() => {
    // A page queued for the previous key (or a disabled list) must never run.
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    if (!enabled || !key) {
      cursor.current = { key: '', page: 0, hasMore: true, busy: false, lastRequest: 0 };
      return;
    }
    cursor.current.key = key;
    cursor.current.hasMore = true;
    // Started in a microtask rather than in the effect body: a new filter set
    // already renders as loading (`state.key !== key`), so the request does not
    // need to set state during the commit.
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) return fetchPage(1, 'reset', key); });
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [key, revision, enabled, fetchPage]);

  const loadMore = useCallback(() => {
    const active = cursor.current;
    if (!enabled || !active.key || active.busy || !active.hasMore) return;
    const wait = MIN_REQUEST_GAP - (Date.now() - active.lastRequest);
    if (wait <= 0) {
      void fetchPage(active.page + 1, 'append', active.key);
      return;
    }
    if (timer.current !== null) return;
    // Hold the slot so overlapping scroll events coalesce into one request.
    active.busy = true;
    timer.current = setTimeout(() => {
      timer.current = null;
      const next = cursor.current;
      next.busy = false;
      if (next.key && next.hasMore && next.key === active.key) void fetchPage(next.page + 1, 'append', next.key);
    }, wait);
  }, [enabled, fetchPage]);

  /**
   * Re-reads the first page in the background and folds it into the loaded rows.
   * Used by the live-refresh polling, which must not throw away the pages the
   * reader scrolled through.
   */
  const refresh = useCallback(() => {
    const active = cursor.current;
    if (!enabled || !active.key || active.busy) return;
    void fetchPage(1, 'merge', active.key);
  }, [enabled, fetchPage]);

  const update = useCallback((updater: (items: T[]) => T[]) => {
    setState(current => ({ ...current, items: updater(current.items) }));
  }, []);

  // Rows fetched for a previous `key` (or an earlier revision) must never leak
  // into the render that follows a filter change.
  const active = state.key === key;
  const items = active ? state.items : [];
  return {
    items,
    /** Nothing usable to render yet: show skeletons. */
    loading: enabled && (!active || (state.loading && items.length === 0)),
    /** Rows are on screen while the first page is re-fetched. */
    refreshing: enabled && active && state.loading && items.length > 0,
    loadingMore: enabled && active && state.loadingMore,
    hasMore: enabled && active && state.hasMore,
    error: active ? state.error : '',
    /** The first page has settled, with rows or with an error. */
    settled: enabled && active && !state.loading,
    loadMore,
    reload,
    refresh,
    update,
  };
}
