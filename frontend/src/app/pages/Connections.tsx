'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type Connections as ConnectionGroups, type SocketEvent, displayName, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from '../components/BackendProvider';
import Avatar from '../components/Avatar';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

export default function Connections() {
  const groups = useResource<ConnectionGroups>('/connections');
  const reload = groups.reload;
  useEffect(() => {
    const listener = (event: Event) => {
      if (['social_changed', 'connected'].includes((event as CustomEvent<SocketEvent>).detail.type)) reload();
    };
    window.addEventListener('social:socket', listener);
    return () => window.removeEventListener('social:socket', listener);
  }, [reload]);
  const { refreshUser } = useBackend();
  const [tab, setTab] = useState<keyof ConnectionGroups>('followers');
  const [busy, setBusy] = useState(false);
  async function change(path: string, method: string) {
    setBusy(true); try { await request(path, method); groups.reload(); await refreshUser(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  const tabs: { key: keyof ConnectionGroups; label: string }[] = [{ key: 'followers', label: 'Followers' }, { key: 'following', label: 'Following' }, { key: 'pending', label: 'Received requests' }, { key: 'requested', label: 'Sent requests' }, { key: 'connections', label: 'Connections' }];
  return <div className="mx-auto max-w-5xl p-6 sm:p-8 space-y-6"><h1 className="text-3xl font-bold">Connections</h1><div className="flex flex-wrap gap-2">{tabs.map(item => <button key={item.key} onClick={() => setTab(item.key)} className={`rounded-lg border px-4 py-2 ${tab === item.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white'}`}>{item.label} ({groups.data?.[item.key].length || 0})</button>)}</div>
    {groups.loading && <Loading />}{groups.error && <RequestState error={groups.error} retry={groups.reload} />}
    <div className="grid gap-4 md:grid-cols-2">{groups.data?.[tab].map(person => <div key={person.userId} className="rounded-xl bg-white p-5 shadow-sm space-y-4"><Link href={`/profile/${person.userId}`} className="flex items-center gap-3"><Avatar name={displayName(person)} avatarUrl={person.avatar} /><div><h2 className="font-semibold">{displayName(person)}</h2><p className="text-sm text-slate-500">@{person.nickname}</p></div></Link><div className="flex gap-3 text-sm"><Link href={`/messages/${person.userId}`} className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">Message</Link>
      {tab === 'following' && <button disabled={busy} onClick={() => void change(`/users/${person.userId}/follow`, 'DELETE')}>Unfollow</button>}
      {tab === 'pending' && <><button disabled={busy} onClick={() => void change(`/connections/${person.userId}`, 'PUT')}>Accept</button><button disabled={busy} onClick={() => void change(`/connections/${person.userId}`, 'DELETE')}>Decline</button></>}
      {(tab === 'connections' || tab === 'requested') && <button disabled={busy} onClick={() => void change(`/connections/${person.userId}`, 'DELETE')}>{tab === 'requested' ? 'Cancel request' : 'Remove connection'}</button>}
    </div></div>)}</div>{groups.data?.[tab].length === 0 && <RequestState empty="No people here yet. Visit Discover to grow your network." />}
  </div>;
}
