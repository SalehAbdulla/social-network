'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isUnauthorized, request } from '../api/social';
import { notifyError } from './notify';

// two quick scrolls would otherwise fire the same page twice
const MIN_REQUEST_GAP = 350;

export interface PageInfo {
  page: number;
  pageSize: number;
}

export interface PagedListOptions<T, R> {
  key: string;
  pageQuery: (page: number) => string;
  pageSize: number;
  normalize: (raw: R, info: PageInfo) => { items: T[]; hasMore?: boolean };
  keyOf: (item: T) => string | number;
  enabled?: boolean;
}

interface PagedListState<T> {
  key: string;
  items: T[];
  hasMore: boolean;
  loading: boolean;
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

export function usePagedList<T, R>(options: PagedListOptions<T, R>) {
  const { key, enabled = true } = options;

  const latest = useRef(options);
  useEffect(() => { latest.current = options; });

  const [state, setState] = useState<PagedListState<T>>(EMPTY);
  const [revision, setRevision] = useState(0);

  const cursor = useRef({ key: '', page: 0, hasMore: true, busy: false, lastRequest: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(() => setRevision(value => value + 1), []);

  const fetchPage = useCallback(async (page: number, mode: 'reset' | 'append' | 'merge', requestKey: string) => {
    const background = mode === 'merge';
    const abort = new AbortController();
    if (mode === 'reset') abortRef.current?.abort();
    abortRef.current = abort;
    cursor.current.busy = true;
    setState(current => mode === 'reset'
      ? { key: requestKey, items: current.key === requestKey ? current.items : [], hasMore: true, loading: true, loadingMore: false, error: '' }
      : mode === 'append'
        ? { ...current, loadingMore: true, error: '' }
        : current);
    try {
      const { pageQuery, normalize, pageSize: size } = latest.current;
      const raw = await request<R>(requestKey + pageQuery(page), 'GET', undefined, abort.signal);
      if (abort.signal.aborted) return;
      const { items, hasMore } = normalize(raw, { page, pageSize: size });
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
      if (!isUnauthorized(error)) notifyError(message, () => setRevision(value => value + 1));
    } finally {
      if (abortRef.current === abort) {
        cursor.current.busy = false;
        cursor.current.lastRequest = Date.now();
      }
    }
  }, []);

  useEffect(() => {
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null; }
    if (!enabled || !key) {
      cursor.current = { key: '', page: 0, hasMore: true, busy: false, lastRequest: 0 };
      return;
    }
    cursor.current.key = key;
    cursor.current.hasMore = true;
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
    active.busy = true;
    timer.current = setTimeout(() => {
      timer.current = null;
      const next = cursor.current;
      next.busy = false;
      if (next.key && next.hasMore && next.key === active.key) void fetchPage(next.page + 1, 'append', next.key);
    }, wait);
  }, [enabled, fetchPage]);

  const refresh = useCallback(() => {
    const active = cursor.current;
    if (!enabled || !active.key || active.busy) return;
    void fetchPage(1, 'merge', active.key);
  }, [enabled, fetchPage]);

  const update = useCallback((updater: (items: T[]) => T[]) => {
    setState(current => ({ ...current, items: updater(current.items) }));
  }, []);

  const active = state.key === key;
  const items = active ? state.items : [];
  return {
    items,
    loading: enabled && (!active || (state.loading && items.length === 0)),
    refreshing: enabled && active && state.loading && items.length > 0,
    loadingMore: enabled && active && state.loadingMore,
    hasMore: enabled && active && state.hasMore,
    error: active ? state.error : '',
    settled: enabled && active && !state.loading,
    loadMore,
    reload,
    refresh,
    update,
  };
}
