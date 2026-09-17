'use client';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request, type SocialUser } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from '../components/BackendProvider';
import Avatar from '../components/Avatar';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

export default function Discover() {
  const { user, refreshUser } = useBackend();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState('');
  const users = useResource<SocialUser[]>(`/users?q=${encodeURIComponent(search)}&offset=${offset}`);
  async function change(id: string, path: string, method: string) {
    setBusy(id); try { await request(path, method); await refreshUser(); users.reload(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(''); }
  }
  return <div className="mx-auto max-w-6xl p-6 sm:p-8 space-y-6"><div><h1 className="text-3xl font-bold">Discover People</h1><p className="mt-2 text-slate-500">Find people to follow and message.</p></div>
    <form className="flex gap-3" onSubmit={event => { event.preventDefault(); setOffset(0); setSearch(input); }}><input aria-label="Search people" value={input} onChange={event => setInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3" placeholder="Search by name, username, bio or location" /><button className="rounded-lg bg-blue-600 px-5 text-white">Search</button></form>
    {users.loading && <Loading />}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{users.data?.map(person => {
      const following = user.following.includes(person.userId);
      return <div key={person.userId} className="rounded-xl bg-white p-5 shadow-sm space-y-4"><Link href={`/profile/${person.userId}`} className="flex items-center gap-3"><Avatar name={displayName(person)} avatarUrl={person.avatar} /><div><h2 className="font-semibold">{displayName(person)}</h2><p className="text-sm text-slate-500">@{person.nickname}</p></div></Link><p className="min-h-10 text-sm text-slate-600">{person.bio || person.location || 'Say hello and start a conversation.'}</p><div className="flex flex-wrap gap-2 text-sm"><button disabled={!!busy} className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700 disabled:opacity-50" onClick={() => void change(person.userId, `/users/${person.userId}/follow`, following ? 'DELETE' : 'PUT')}>{following ? 'Unfollow' : 'Follow'}</button><Link href={`/messages/${person.userId}`} className="rounded-lg border border-slate-200 px-3 py-2">Message</Link></div></div>;
    })}</div>
    {users.data?.length === 0 && <RequestState empty="No people matched your search." />}
    <div className="flex justify-between"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))} className="disabled:opacity-40">Previous</button><button disabled={!users.data || users.data.length < 30} onClick={() => setOffset(offset + 30)} className="disabled:opacity-40">Next</button></div>
  </div>;
}
