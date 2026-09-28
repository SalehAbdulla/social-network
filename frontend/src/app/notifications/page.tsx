'use client';
import Pagination from '../components/Pagination';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type FollowRequest, type Notification, dateLabel, errorMessage, request } from '../api/social';
import { useBackend } from '../components/BackendProvider';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useResource } from '../lib/useResource';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

function notificationPath(item: Notification) {
  if (item.entityType === 'group_invitation') return '/messages/groups';
  if (item.entityType.startsWith('group_')) return `/messages/groups/${item.entityId}`;
  if (item.entityType === 'message') return `/messages/${item.actorId}`;
  if (item.entityType === 'comment') return item.postId ? `/post/${item.postId}` : '/profile';
  return `/profile/${item.actorId}`;
}

export default function Notifications() {
  const { refreshUser } = useBackend();
  const [requestOffset, setRequestOffset] = useState(0);
  const [deciding, setDeciding] = useState('');
  const pending = useResource<FollowRequest[]>(`/follow-requests?offset=${requestOffset}`);
  useLiveRefresh(pending.reload);
  const [offset, setOffset] = useState(0);
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState(false);
  const notifications = useResource<{ notifications: Notification[]; totalElements: number }>(`/notifications?offset=${offset}&limit=20&unread=${unread}`);
  const reload = notifications.reload;
  useEffect(() => { window.addEventListener('social:socket', reload); const timer = setInterval(reload, 30000); return () => { window.removeEventListener('social:socket', reload); clearInterval(timer); }; }, [reload]);
  async function mark(path: string) {
    setBusy(true); try { await request(path, 'PATCH'); reload(); window.dispatchEvent(new Event('social:notifications')); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  async function decide(userId: string, accept: boolean) {
    if (deciding) return;
    setDeciding(userId);
    try {
      await request(`/follow-requests/${userId}`, accept ? 'PUT' : 'DELETE');
      await refreshUser();
      if (pending.data?.length === 1 && requestOffset > 0) setRequestOffset(value => value - 30);
      pending.reload();
      reload();
      window.dispatchEvent(new Event('social:notifications'));
      toast.success(accept ? 'Follow request accepted.' : 'Follow request declined.');
    } catch (error) {
      toast.error(errorMessage(error));
      pending.reload();
    } finally { setDeciding(''); }
  }
  return <div className="mx-auto max-w-3xl p-6 sm:p-8 space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">Notifications</h1><button disabled={busy} onClick={() => void mark('/notifications/read-all')} className="text-sm text-blue-600">Mark all as read</button></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={unread} onChange={event => { setUnread(event.target.checked); setOffset(0); }} />Unread only</label>
    <section aria-label="Follow requests" className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-text">Follow requests</h2>
      {pending.loading && <Loading height={80} />}
      {pending.data?.map(person => <div key={person.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
        <Link href={`/profile/${person.userId}`} className="font-medium text-brand-1">@{person.nickname}</Link>
        <div className="flex gap-2">
          <button disabled={!!deciding} onClick={() => void decide(person.userId, true)} className="rounded-lg bg-brand-1 px-3 py-2 text-white disabled:opacity-50">Accept</button>
          <button disabled={!!deciding} onClick={() => void decide(person.userId, false)} className="rounded-lg border border-border px-3 py-2 text-text disabled:opacity-50">Decline</button>
        </div>
      </div>)}
      {pending.data?.length === 0 && <RequestState empty="No pending follow requests." />}
      <Pagination label="Follow requests pagination" page={requestOffset / 30 + 1} hasNext={pending.data?.length === 30} loading={pending.loading} onChange={page => setRequestOffset((page - 1) * 30)} />
    </section>
    {notifications.loading && <Loading />}
    {notifications.data?.notifications.map(item => <div key={item.notificationId} className={`rounded-xl border p-5 space-y-2 ${item.isRead ? 'border-slate-100 bg-white' : 'border-blue-100 bg-blue-50'}`}><p><Link href={`/profile/${item.actorId}`} className="font-semibold">@{item.actorNickname}</Link> {item.entityType === 'group_invitation' ? 'invited you to a group.' : item.entityType === 'group_request' ? 'requested to join your group.' : item.entityType === 'group_event' ? 'created a group event.' : item.entityType === 'message' ? 'sent you a message.' : item.entityType === 'comment' ? 'commented on your post.' : item.entityType === 'follow_request' ? 'requested to follow you.' : item.entityType === 'follow' ? 'followed you.' : 'updated a connection request.'}</p><p className="text-xs text-slate-400">{dateLabel(item.createdAt)}</p><div className="flex gap-4 text-sm"><Link href={notificationPath(item)} className="text-blue-600">View</Link>{!item.isRead && <button disabled={busy} onClick={() => void mark(`/notifications/${item.notificationId}/read`)}>Mark as read</button>}</div></div>)}
    {notifications.data?.notifications.length === 0 && <RequestState empty="You're all caught up." />}
    <Pagination page={offset / 20 + 1} hasNext={!!notifications.data && offset + 20 < notifications.data.totalElements} loading={notifications.loading} onChange={page => setOffset((page - 1) * 20)} />
  </div>;
}
