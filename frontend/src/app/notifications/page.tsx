'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { type FollowRequest, type Notification, dateLabel, errorMessage, isoTimestamp, relativeLabel, request } from '../api/social';
import { useBackend } from '../components/BackendProvider';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { usePagedList } from '../lib/usePagedList';
import RequestState from '../components/RequestState';
import LoadMore from '../components/LoadMore';
import { RowsSkeleton } from '../components/Skeletons';

const REQUESTS_PER_PAGE = 30;
const NOTIFICATIONS_PER_PAGE = 20;

function notificationPath(item: Notification) {
  if (item.entityType === 'group_invitation') return '/messages/groups';
  // A join request is answered on the group's info tab and an event lives on its
  // events tab, so both land where the reader has to act.
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
 * A private message is not a notification, so the two no longer look alike:
 * message rows carry their own accent, a caption and a chat call to action,
 * while every other type keeps the notification styling. The API keeps them
 * apart too — the sidebar bell asks for `?exclude=message`, the Messages entry
 * for `?types=message`.
 */
function NotificationCard({ item, busy, mark }: {
  item: Notification;
  busy: boolean;
  mark: (path: string) => Promise<void>;
}) {
  const message = item.entityType === 'message';
  const tone = message
    ? (item.isRead ? 'border-teal-200 bg-card' : 'border-teal-300 bg-teal-50')
    : (item.isRead ? 'border-slate-100 bg-white' : 'border-blue-100 bg-blue-50');

  return <div className={`rounded-xl border p-5 space-y-2 ${tone}`}>
    {message && <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-700"><MessageSquare size={14} aria-hidden="true" />Private message</p>}
    <p><Link href={`/profile/${item.actorId}`} className="font-semibold">@{item.actorNickname}</Link> {notificationText(item)}</p>
    <p className="text-xs text-slate-400"><time dateTime={isoTimestamp(item.createdAt)} title={dateLabel(item.createdAt)}>{relativeLabel(item.createdAt)}</time></p>
    <div className="flex gap-4 text-sm"><Link href={notificationPath(item)} className={message ? 'font-medium text-teal-700' : 'text-blue-600'}>{message ? 'Open chat' : 'View'}</Link>{!item.isRead && <button disabled={busy} onClick={() => void mark(`/notifications/${item.notificationId}/read`)}>Mark as read</button>}</div>
  </div>;
}

export default function Notifications() {
  const { refreshUser } = useBackend();
  const [deciding, setDeciding] = useState('');
  const pending = usePagedList<FollowRequest, FollowRequest[]>({
    key: '/follow-requests',
    pageQuery: page => `?offset=${(page - 1) * REQUESTS_PER_PAGE}`,
    pageSize: REQUESTS_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: person => person.userId,
  });
  useLiveRefresh(pending.refresh);
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState(false);
  const notifications = usePagedList<Notification, { notifications: Notification[]; totalElements: number }>({
    // `unread` is part of the identity, so flipping the filter restarts at offset 0.
    key: `/notifications?limit=${NOTIFICATIONS_PER_PAGE}&unread=${unread}`,
    pageQuery: page => `&offset=${(page - 1) * NOTIFICATIONS_PER_PAGE}`,
    pageSize: NOTIFICATIONS_PER_PAGE,
    normalize: (raw, { page, pageSize }) => ({ items: raw.notifications, hasMore: page * pageSize < raw.totalElements }),
    keyOf: item => item.notificationId,
  });
  // Socket bursts and the poll re-read the newest page only, so anything already
  // scrolled into view stays where it is.
  const reload = notifications.refresh;
  useEffect(() => { window.addEventListener('social:socket', reload); const timer = setInterval(reload, 30000); return () => { window.removeEventListener('social:socket', reload); clearInterval(timer); }; }, [reload]);
  async function mark(path: string) {
    setBusy(true); try {
      await request(path, 'PATCH');
      // Under "Unread only" a merge could not drop the rows that were just read.
      if (unread) notifications.reload(); else reload();
      window.dispatchEvent(new Event('social:notifications'));
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  async function decide(userId: string, accept: boolean) {
    if (deciding) return;
    setDeciding(userId);
    try {
      await request(`/follow-requests/${userId}`, accept ? 'PUT' : 'DELETE');
      await refreshUser();
      // The row is settled either way, so drop it locally instead of paging backwards.
      pending.update(items => items.filter(person => person.userId !== userId));
      pending.refresh();
      reload();
      window.dispatchEvent(new Event('social:notifications'));
      toast.success(accept ? 'Follow request accepted.' : 'Follow request declined.');
    } catch (error) {
      toast.error(errorMessage(error));
      pending.refresh();
    } finally { setDeciding(''); }
  }
  return <div className="mx-auto max-w-3xl p-6 sm:p-8 space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">Notifications</h1><button disabled={busy} onClick={() => void mark('/notifications/read-all')} className="text-sm text-blue-600">Mark all as read</button></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={unread} onChange={event => setUnread(event.target.checked)} />Unread only</label>
    <section aria-label="Follow requests" className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-text">Follow requests</h2>
      {pending.loading && <RowsSkeleton count={2} />}
      {pending.items.map(person => <div key={person.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <Link href={`/profile/${person.userId}`} className="font-medium text-brand-1">@{person.nickname}</Link>
        <div className="flex gap-2">
          <button disabled={!!deciding} onClick={() => void decide(person.userId, true)} className="rounded-lg bg-brand-1 px-3 py-2 text-white disabled:opacity-50">Accept</button>
          <button disabled={!!deciding} onClick={() => void decide(person.userId, false)} className="rounded-lg border border-border px-3 py-2 text-text disabled:opacity-50">Decline</button>
        </div>
      </div>)}
      {pending.settled && !pending.error && pending.items.length === 0 && <RequestState empty="No pending follow requests." />}
      {pending.items.length > 0 && <LoadMore loading={pending.loadingMore} hasMore={pending.hasMore} onLoadMore={pending.loadMore} label="Load more requests" endLabel={null} className="py-2" />}
    </section>
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-text">Activity</h2>
      {notifications.loading && <RowsSkeleton />}
      {notifications.items.map(item => <NotificationCard key={item.notificationId} item={item} busy={busy} mark={mark} />)}
      {notifications.settled && !notifications.error && notifications.items.length === 0 && <RequestState empty="You're all caught up." />}
      {notifications.items.length > 0 && <LoadMore loading={notifications.loadingMore} hasMore={notifications.hasMore} onLoadMore={notifications.loadMore} label="Load more notifications" />}
    </div>
  </div>;
}
