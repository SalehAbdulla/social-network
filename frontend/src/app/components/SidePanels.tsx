'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, X } from 'lucide-react';
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../lib/recentSearches';

export type PanelKind = 'search';

/**
 * The slide-out panel on the rail's right edge — Instagram's Search drawer. The bell no longer
 * opens a panel; it links to /notifications, so this drawer now holds only the search field and
 * its recent terms. It slides with a transform (`app-panel`), and only the `open` prop toggles
 * it, which lets the sidebar keep it mounted through the exit animation.
 */
export default function SidePanels({ kind, open, onClose, panelRef }: {
  kind: PanelKind;
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  return <div id="app-panel" ref={panelRef} className={`app-panel fixed inset-y-0 left-[72px] z-30 hidden w-[397px] overflow-y-auto rounded-r-[16px] border-r border-rail-border bg-rail font-sans leading-5 shadow-[0_0_30px_rgba(0,0,0,0.18)] md:block ${open ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-6 opacity-0'}`}>
    {kind === 'search' && <SearchPanel onClose={onClose} />}
  </div>;
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-4 pb-5 pt-6 text-base font-bold text-text">{children}</h2>;
}

/** Title, a rounded search field with a clear button, a divider, then the recent terms. */
function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  // Storage is read after mount so the server and the first client render agree on an empty list.
  useEffect(() => {
    const timer = window.setTimeout(() => setRecent(readRecentSearches()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const run = (value: string) => {
    const next = value.trim();
    if (!next) return;
    setRecent(rememberSearch(next));
    onClose();
    router.push(`/search?q=${encodeURIComponent(next)}`);
  };
  return <div className="flex h-full flex-col">
    <PanelTitle>Search</PanelTitle>
    <div className="px-4">
      <form role="search" onSubmit={event => { event.preventDefault(); run(term); }} className="flex items-center gap-2 rounded-[8px] bg-rail-hover px-3 py-2">
        <SearchIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <input value={term} onChange={event => setTerm(event.target.value)} placeholder="Search" aria-label="Search" className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-muted" />
        {!!term && <button type="button" aria-label="Clear search" onClick={() => setTerm('')} className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-white"><X size={13} aria-hidden="true" /></button>}
      </form>
    </div>
    <hr className="my-4 border-t border-rail-border" />
    {recent.length > 0 ? <>
      <div className="flex items-center justify-between px-4 pb-2">
        <h3 className="text-base font-bold text-text">Recent</h3>
        <button type="button" onClick={() => { clearRecentSearches(); setRecent([]); }} className="text-sm font-semibold text-brand-1 hover:text-brand-2">Clear all</button>
      </div>
      <ul className="px-2 pb-4">
        {recent.map(value => <li key={value}>
          <button type="button" onClick={() => run(value)} className="flex w-full items-center gap-3 rounded-[8px] px-2 py-2 text-left hover:bg-rail-hover">
            <SearchIcon size={20} className="shrink-0 text-text" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm text-text">{value}</span>
          </button>
        </li>)}
      </ul>
    </> : <p className="px-4 text-sm text-muted">No recent searches.</p>}
  </div>;
}
