'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, X } from 'lucide-react';
import { type Notification, relativeLabel, request } from '../api/social';
import { useResource } from '../lib/useResource';
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../lib/recentSearches';
import Avatar from './Avatar';

export type PanelKind = 'search' | 'notifications';

/** Where a notification row leads. The panel keeps the mapping local rather than importing a
 *  page, and it is kept in step with the notifications page by hand. */
function notificationPath(item: Notification) {
  if (item.entityType === 'group_invitation') return '/messages/groups';
  if (item.entityType === 'group_request') return `/messages/groups/${item.entityId}?tab=info`;
  if (item.entityType === 'group_event') return `/messages/groups/${item.entityId}?tab=events`;
  if (item.entityType.startsWith('group_')) return `/messages/groups/${item.entityId}`;
  if (item.entityType === 'message') return `/messages/${item.actorId}`;
  if (item.entityType === 'comment') return item.postId ? `/post/${item.postId}` : '/profile';
  return `/profile/${item.actorId}`;
}

function notificationText(item: Notification) {
  if (item.entityType === 'group_invitation') return 'invited you to a group.';
  if (item.entityType === 'group_request') return 'requested to join your group.';
  if (item.entityType === 'group_event') return 'created a group event.';
  if (item.entityType === 'message') return 'sent you a private message.';
  if (item.entityType === 'comment') return 'commented on your post.';
  if (item.entityType === 'follow_request') return 'requested to follow you.';
  if (item.entityType === 'follow') return 'followed you.';
  return 'updated a connection request.';
}

/**
 * The slide-out panel on the rail's right edge — Instagram's Search and Notifications drawer.
 * It is one fixed element whose content swaps, so switching between the two never closes and
 * reopens it. It slides with a transform (`app-panel`), and only the `open` prop toggles it,
 * which lets the sidebar keep it mounted through the exit animation.
 */
export default function SidePanels({ kind, open, onClose, panelRef }: {
  kind: PanelKind;
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  return <div id="app-panel" ref={panelRef} className={`app-panel fixed inset-y-0 left-[72px] z-30 hidden w-[397px] overflow-y-auto rounded-r-[16px] border-r border-rail-border bg-rail font-sans leading-5 shadow-[0_0_30px_rgba(0,0,0,0.18)] md:block ${open ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-6 opacity-0'}`}>
    {kind === 'search' ? <SearchPanel onClose={onClose} /> : <NotificationsPanel onClose={onClose} />}
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

/** Title, then the newest notifications grouped by age the way Instagram groups them. */
function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data, loading } = useResource<{ notifications: Notification[]; totalElements: number }>('/notifications?limit=30&unread=false');
  const groups = useMemo(() => groupByAge(data?.notifications ?? []), [data]);

  const open = (item: Notification) => {
    onClose();
    // Fire-and-forget: the row leads somewhere, and the badges are settled by the event.
    if (!item.isRead) {
      request(`/notifications/${item.notificationId}/read`, 'PATCH')
        .then(() => window.dispatchEvent(new Event('social:notifications')))
        .catch(() => { /* the notifications page's own button can retry */ });
    }
    router.push(notificationPath(item));
  };

  return <div className="flex h-full flex-col">
    <PanelTitle>Notifications</PanelTitle>
    {loading && <p className="px-4 text-sm text-muted">Loading…</p>}
    {!loading && groups.every(group => group.items.length === 0) && <p className="px-4 text-sm text-muted">No notifications yet.</p>}
    {groups.map(group => group.items.length === 0 ? null : <section key={group.label} className="pb-2">
      <h3 className="px-4 pb-1 pt-3 text-base font-bold text-text">{group.label}</h3>
      <ul className="px-2">
        {group.items.map(item => <li key={item.notificationId}>
          <button type="button" onClick={() => open(item)} className={`flex w-full items-start gap-3 rounded-[8px] px-2 py-3 text-left hover:bg-rail-hover ${item.isRead ? '' : 'bg-rail-hover'}`}>
            <Avatar name={item.actorNickname} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-text"><span className="font-semibold">@{item.actorNickname}</span> {notificationText(item)}</span>
              <span className="mt-0.5 block text-xs text-muted">{relativeLabel(item.createdAt)}</span>
            </span>
            {!item.isRead && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-badge" />}
          </button>
        </li>)}
      </ul>
    </section>)}
  </div>;
}

/** This week / this month / earlier, the three buckets Instagram splits notifications into. */
function groupByAge(items: Notification[]) {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const month = 30 * 24 * 60 * 60 * 1000;
  const groups: Array<{ label: string; items: Notification[] }> = [
    { label: 'This week', items: [] },
    { label: 'This month', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const item of items) {
    const value = item.createdAt.includes('T') ? item.createdAt : `${item.createdAt.replace(' ', 'T')}Z`;
    const age = now - new Date(value).getTime();
    if (age < week) groups[0].items.push(item);
    else if (age < month) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  return groups;
}
