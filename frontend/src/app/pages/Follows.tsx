'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type FollowLists, type SocketEvent, displayName, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from '../components/BackendProvider';
import Avatar from '../components/Avatar';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

export default function Follows() {
  const people = useResource<FollowLists>('/follows');
  const reload = people.reload;
  const { user, refreshUser } = useBackend();
  const [tab, setTab] = useState<keyof FollowLists>('followers');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => {
      if (['social_changed', 'connected'].includes((event as CustomEvent<SocketEvent>).detail.type)) reload();
    };
    window.addEventListener('social:socket', listener);
    return () => window.removeEventListener('social:socket', listener);
  }, [reload]);
  async function toggleFollow(userId: string, following: boolean) {
    setBusy(true);
    try {
      await request(`/users/${userId}/follow`, following ? 'DELETE' : 'PUT');
      reload(); await refreshUser();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-5xl p-6 sm:p-8 space-y-6">
    <h1 className="text-3xl font-bold">Followers and following</h1>
    <div className="flex gap-2">{(['followers', 'following'] as const).map(key => <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key} className={`rounded-lg border px-4 py-2 capitalize ${tab === key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white'}`}>{key} ({people.data?.[key].length || 0})</button>)}</div>
    {people.loading && <Loading />}{people.error && <RequestState error={people.error} retry={reload} />}
    <div className="grid gap-4 md:grid-cols-2">{people.data?.[tab].map(person => {
      const following = user.following.includes(person.userId);
      return <div key={person.userId} className="rounded-xl bg-white p-5 shadow-sm space-y-4">
        <Link href={`/profile/${person.userId}`} className="flex items-center gap-3"><Avatar name={displayName(person)} avatarUrl={person.avatar} /><div><h2 className="font-semibold">{displayName(person)}</h2><p className="text-sm text-slate-500">@{person.nickname}</p></div></Link>
        <div className="flex gap-3 text-sm"><button disabled={busy} onClick={() => void toggleFollow(person.userId, following)} className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700 disabled:opacity-50">{following ? 'Unfollow' : 'Follow'}</button><Link href={`/messages/${person.userId}`} className="rounded-lg border border-slate-200 px-3 py-2">Message</Link></div>
      </div>;
    })}</div>
    {people.data?.[tab].length === 0 && <RequestState empty="No people here yet. Visit Discover to find people to follow." />}
  </div>;
}
