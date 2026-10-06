'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronDown, Search, SquarePen } from 'lucide-react';
import ConversationRow, { type ConversationItem } from './ConversationRow';

/** The row shape the page resolves each conversation into; re-exported for its callers. */
export type { ConversationItem } from './ConversationRow';

/**
 * The conversation column: a name, a compose button, the Primary/Groups folders, the
 * search pill and the rows. It owns no data — the page resolves each conversation into
 * a `ConversationItem` and hands the list down — so a person and a group are drawn by
 * the same row and the column stays one component for both routes.
 *
 * Tabs are real links to the two routes the app already had (`/messages` and
 * `/messages/groups`), which is what keeps the browser history and the deep links
 * working exactly as before.
 */
export default function ConversationList({ tab, currentUserName, search, onSearch, onCompose, composeLabel = 'New message', items, loading, error, onRetry, empty, activeKey, extra }: {
  tab: 'primary' | 'groups';
  currentUserName: string;
  search: string;
  onSearch: (value: string) => void;
  onCompose: () => void;
  composeLabel?: string;
  items: ConversationItem[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  empty: string;
  activeKey?: string;
  extra?: ReactNode;
}) {
  return <aside aria-label="Conversations" className="dm-list">
    <div className="dm-list-head">
      <span className="dm-list-title dm-collapse">
        {currentUserName}
        <ChevronDown size={16} aria-hidden="true" />
      </span>
      <button type="button" aria-label={composeLabel} title={composeLabel} className="dm-icon" onClick={onCompose}>
        <SquarePen aria-hidden="true" />
      </button>
    </div>
    <nav aria-label="Conversation folders" className="dm-tabs dm-collapse">
      <Link href="/messages" aria-current={tab === 'primary' ? 'page' : undefined} className="dm-tab">Primary</Link>
      <Link href="/messages/groups" aria-current={tab === 'groups' ? 'page' : undefined} className="dm-tab">Groups</Link>
    </nav>
    <label className="dm-search dm-collapse">
      <Search aria-hidden="true" />
      <input
        type="search"
        aria-label="Search conversations"
        value={search}
        onChange={event => onSearch(event.target.value)}
        placeholder="Search"
      />
    </label>
    {extra && <div className="dm-collapse">{extra}</div>}
    <div className="dm-scroll">
      {loading && <p className="dm-empty-note" role="status">Loading…</p>}
      {!!error && <div className="p-4 text-center"><button type="button" className="dm-secondary" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && items.length === 0 && <p className="dm-empty-note">{empty}</p>}
      {items.map(item => <ConversationRow key={item.key} item={item} active={item.key === activeKey} />)}
    </div>
  </aside>;
}
