'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react';

type LoadMoreProps = {
  /** A follow-up page is in flight. */
  loading: boolean;
  /** The list has more rows to reveal. */
  hasMore: boolean;
  onLoadMore: () => void;
  /** Auto-load when the sentinel scrolls into view. Off for lists that opt into a click. */
  auto?: boolean;
  label?: string;
  /** End-of-list cap. Pass `null` for lists that should end silently. */
  endLabel?: string | null;
  /** Render as a tile for a horizontal strip instead of a centred button. */
  compact?: boolean;
  className?: string;
};

/**
 * End-of-list affordance for the paged lists.
 *
 * A real button stays in the DOM for keyboard and screen-reader users, while an
 * `IntersectionObserver` presses it for everyone else once the last row is
 * close to the viewport. The observer re-arms after every page, so a list that
 * still does not fill the viewport keeps filling itself instead of stalling.
 */
export default function LoadMore({
  loading,
  hasMore,
  onLoadMore,
  auto = true,
  label = 'Load more',
  endLabel = "You're all caught up",
  compact = false,
  className = '',
}: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!auto || !node || !hasMore || loading) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) onLoadMore();
    }, { rootMargin: '500px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [auto, hasMore, loading, onLoadMore]);

  if (!hasMore) {
    return endLabel ? (
      <p className={`flex items-center justify-center gap-2 py-6 text-xs font-medium text-slate-400 ${className}`}>
        <CheckCircle2 size={14} aria-hidden="true" />
        {endLabel}
      </p>
    ) : null;
  }

  // Compact mode turns the control into a tile that fits a horizontal strip
  // (stories), where a full-width button would break the row.
  if (compact) {
    return (
      <div ref={sentinel} className={`flex shrink-0 items-center justify-center ${className}`}>
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          aria-busy={loading}
          aria-label={label}
          className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/70 text-xs font-medium text-slate-500 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-wait disabled:opacity-70"
        >
          {loading
            ? <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            : <ChevronRight size={20} aria-hidden="true" />}
          {loading ? 'Loading' : 'More'}
        </button>
        <span role="status" aria-live="polite" className="sr-only">{loading ? 'Loading more items' : ''}</span>
      </div>
    );
  }

  return (
    <div ref={sentinel} className={`flex flex-col items-center gap-2 py-6 ${className}`}>
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-text shadow-sm transition hover:-translate-y-px hover:border-teal-200 hover:text-teal-800 hover:shadow-md disabled:translate-y-0 disabled:cursor-wait disabled:opacity-70"
      >
        {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
        {loading ? 'Loading more…' : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {loading ? 'Loading more items' : ''}
      </span>
    </div>
  );
}
