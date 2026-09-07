'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type Notification, dateLabel, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

export default function Notifications() {
  const [offset, setOffset] = useState(0);
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState(false);
  const notifications = useResource<{ notifications: Notification[]; totalElements: number }>(`/notifications?offset=${offset}&limit=20&unread=${unread}`);
  const reload = notifications.reload;
  useEffect(() => { window.addEventListener('social:socket', reload); const timer = setInterval(reload, 30000); return () => { window.removeEventListener('social:socket', reload); clearInterval(timer); }; }, [reload]);
  async function mark(path: string) {
    setBusy(true); try { await request(path, 'PATCH'); reload(); window.dispatchEvent(new Event('social:notifications')); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-3xl p-6 sm:p-8 space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">Notifications</h1><button disabled={busy} onClick={() => void mark('/notifications/read-all')} className="text-sm text-blue-600">Mark all as read</button></div><label className="flex gap-2 text-sm"><input type="checkbox" checked={unread} onChange={event => { setUnread(event.target.checked); setOffset(0); }} />Unread only</label>
    {notifications.loading && <Loading />}{notifications.error && <RequestState error={notifications.error} retry={reload} />}
    {notifications.data?.notifications.map(item => <div key={item.notificationId} className={`rounded-xl border p-5 space-y-2 ${item.isRead ? 'border-slate-100 bg-white' : 'border-blue-100 bg-blue-50'}`}><p><Link href={`/profile/${item.actorId}`} className="font-semibold">@{item.actorNickname}</Link> {item.entityType === 'message' ? 'sent you a message.' : item.entityType === 'comment' ? 'commented on your post.' : item.entityType === 'follow' ? 'followed you.' : 'updated a connection request.'}</p><p className="text-xs text-slate-400">{dateLabel(item.createdAt)}</p><div className="flex gap-4 text-sm"><Link href={item.entityType === 'message' ? `/messages/${item.actorId}` : item.entityType === 'comment' ? '/profile' : '/connections'} className="text-blue-600">View</Link>{!item.isRead && <button disabled={busy} onClick={() => void mark(`/notifications/${item.notificationId}/read`)}>Mark as read</button>}</div></div>)}
    {notifications.data?.notifications.length === 0 && <RequestState empty="You're all caught up." />}
    <div className="flex justify-between text-sm"><button disabled={offset === 0} className="disabled:opacity-40" onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button><button disabled={!notifications.data || offset + 20 >= notifications.data.totalElements} className="disabled:opacity-40" onClick={() => setOffset(offset + 20)}>Next</button></div>
  </div>;
}
