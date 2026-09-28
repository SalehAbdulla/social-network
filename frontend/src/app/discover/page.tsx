'use client';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request, type SocialUser } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { useBackend } from '../components/BackendProvider';
import Avatar from '../components/Avatar';
import LoadMore from '../components/LoadMore';
import MessageAction from '../components/MessageAction';
import RequestState from '../components/RequestState';
import { CardGridSkeleton } from '../components/Skeletons';
import { useLiveRefresh } from '../lib/useLiveRefresh';

const PEOPLE_PER_PAGE = 30;

export default function Discover() {
  const { user, refreshUser } = useBackend();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const people = usePagedList<SocialUser, SocialUser[]>({
    // The query is the identity of the list, so a new search starts at offset 0.
    key: `/users?q=${encodeURIComponent(search)}`,
    pageQuery: page => `&offset=${(page - 1) * PEOPLE_PER_PAGE}`,
    pageSize: PEOPLE_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: person => person.userId,
  });
  // Background polling folds the newest page in, keeping any pages already opened.
  useLiveRefresh(people.refresh);
  async function change(id: string, path: string, method: string) {
    setBusy(id); try { await request(path, method); await refreshUser(); people.refresh(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(''); }
  }
  return <div className="mx-auto max-w-6xl p-6 sm:p-8 space-y-6"><div><h1 className="text-3xl font-bold">Discover People</h1><p className="mt-2 text-slate-500">Find people to follow and message.</p></div>
    <form className="flex gap-3" onSubmit={event => { event.preventDefault(); setSearch(input); }}><input aria-label="Search people" value={input} onChange={event => setInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3" placeholder="Search by name, username, bio or location" /><button className="rounded-lg bg-blue-600 px-5 text-white">Search</button></form>
    {people.loading && <CardGridSkeleton />}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{people.items.map(person => {
      const following = user.following.includes(person.userId);
      return <div key={person.userId} className="rounded-xl bg-white p-5 shadow-sm space-y-4"><Link href={`/profile/${person.userId}`} className="flex items-center gap-3"><Avatar name={displayName(person)} avatarUrl={person.avatar} /><div><h2 className="font-semibold">{displayName(person)}</h2><p className="text-sm text-slate-500">@{person.nickname}</p></div></Link><p className="min-h-10 text-sm text-slate-600">{person.bio || person.location || 'Say hello and start a conversation.'}</p><div className="flex flex-wrap gap-2 text-sm"><button disabled={!!busy || (person.pendingIncoming && !following)} title={person.pendingOutgoing ? 'Cancel follow request' : person.pendingIncoming ? 'Review this request in Notifications' : undefined} className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700 disabled:opacity-50" onClick={() => void change(person.userId, `/users/${person.userId}/follow`, following || person.pendingOutgoing ? 'DELETE' : 'PUT')}>{following ? 'Unfollow' : person.pendingOutgoing ? 'Requested' : 'Follow'}</button><MessageAction userId={person.userId} allowed={person.canMessage === true} className="rounded-lg border border-slate-200 px-3 py-2" /></div></div>;
    })}</div>
    {people.settled && !people.error && people.items.length === 0 && <RequestState empty="No people matched your search." />}
    {people.items.length > 0 && <LoadMore loading={people.loadingMore} hasMore={people.hasMore} onLoadMore={people.loadMore} label="Load more people" />}
  </div>;
}
