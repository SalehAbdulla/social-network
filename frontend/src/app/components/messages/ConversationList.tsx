'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronDown, Search, SquarePen } from 'lucide-react';
import ConversationRow, { type ConversationItem } from './ConversationRow';
import { GroupRowsSkeleton } from '../Skeletons';

export type { ConversationItem } from './ConversationRow';

export default function ConversationList({ tab, currentUserName, search, onSearch, onCompose, composeLabel = 'New message', items, loading, error, onRetry, empty, activeKey, collapsed, onToggleCollapsed, extra }: {
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
  collapsed: boolean;
  onToggleCollapsed: () => void;
  extra?: ReactNode;
}) {
  return <aside aria-label="Conversations" className="dm-list">
    <div className="dm-list-head">
      <span className="dm-list-title dm-collapse">{currentUserName}</span>
      <button
        type="button"
        className="dm-icon dm-collapse-toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Show the conversation list' : 'Hide the conversation list'}
        title={collapsed ? 'Show the conversation list' : 'Hide the conversation list'}
        onClick={onToggleCollapsed}
      >
        <ChevronDown aria-hidden="true" className="dm-collapse-chevron" />
      </button>
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
      {loading && <GroupRowsSkeleton count={6} />}
      {!!error && <div className="p-4 text-center"><button type="button" className="dm-secondary" onClick={onRetry}>Retry</button></div>}
      {!loading && !error && items.length === 0 && <p className="dm-empty-note">{empty}</p>}
      {items.map(item => <ConversationRow key={item.key} item={item} active={item.key === activeKey} />)}
    </div>
  </aside>;
}
