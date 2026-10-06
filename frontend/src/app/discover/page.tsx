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
  // Optimistic follow flag per card: the button reads this until the refreshed
  // user (the real source) arrives, then it is cleared. `pendingOutgoing` lives in
  // the row instead, because a request has to keep showing as "Requested".
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const isFollowingPerson = (person: SocialUser) => person.userId in followed
    ? followed[person.userId]
    : user.following.includes(person.userId);
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
  async function change(person: SocialUser, path: string, method: string) {
    if (busy) return;
    setBusy(person.userId);
    // Optimistic: the card flips now rather than after the round trip. Whether the
    // viewer follows is global state (`user.following`), so the intent is held here
    // until the refreshed user replaces it; a follow *request* is row state, so it
    // is written into the row and stays there. What is gone is the list refetch:
    // the row already carries everything the card shows, and the background poll
    // folds later pages in on its own.
    const isRequest = method === 'PUT' && !person.isPublic;
    if (method !== 'DELETE') setFollowed(state => ({ ...state, [person.userId]: person.isPublic }));
    else setFollowed(state => ({ ...state, [person.userId]: false }));
    if (isRequest) people.update(items => items.map(item => item.userId === person.userId ? { ...item, pendingOutgoing: true } : item));
    try {
      await request(path, method);
      await refreshUser();
      // The refreshed user is the source of truth again; only the flag is cleared.
      setFollowed(state => { const next = { ...state }; delete next[person.userId]; return next; });
      if (method === 'DELETE') people.update(items => items.map(item => item.userId === person.userId ? { ...item, pendingOutgoing: false } : item));
    } catch (error) {
      setFollowed(state => { const next = { ...state }; delete next[person.userId]; return next; });
      if (isRequest) people.update(items => items.map(item => item.userId === person.userId ? { ...item, pendingOutgoing: false } : item));
      toast.error(errorMessage(error));
    } finally { setBusy(''); }
  }
  return <div className="mx-auto max-w-6xl p-6 sm:p-8 space-y-6">
    <form className="flex gap-3" onSubmit={event => { event.preventDefault(); setSearch(input); }}><input aria-label="Search people" value={input} onChange={event => setInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3" placeholder="Search by name, username, bio or location" /><button className="rounded-lg bg-blue-600 px-5 text-white">Search</button></form>
    {people.loading && <CardGridSkeleton />}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{people.items.map(person => {
      const following = isFollowingPerson(person);
      return <div key={person.userId} className="rounded-xl bg-white p-5 shadow-sm space-y-4"><Link href={`/profile/${person.userId}`} className="flex items-center gap-3"><Avatar name={displayName(person)} avatarUrl={person.avatar} /><div className="min-w-0"><h2 className="truncate font-semibold">{displayName(person)}</h2><p className="truncate text-sm text-slate-500">@{person.nickname}</p></div></Link><p className="min-h-10 break-words text-sm text-slate-600">{person.bio || person.location || 'Say hello and start a conversation.'}</p><div className="flex flex-wrap gap-2 text-sm"><button disabled={!!busy || (person.pendingIncoming && !following)} title={person.pendingOutgoing ? 'Cancel follow request' : person.pendingIncoming ? 'Review this request in Notifications' : undefined} className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700 disabled:opacity-50" onClick={() => void change(person, `/users/${person.userId}/follow`, following || person.pendingOutgoing ? 'DELETE' : 'PUT')}>{following ? 'Unfollow' : person.pendingOutgoing ? 'Requested' : 'Follow'}</button><MessageAction userId={person.userId} allowed={person.canMessage === true} className="rounded-lg border border-slate-200 px-3 py-2" /></div></div>;
    })}</div>
    {people.settled && !people.error && people.items.length === 0 && <RequestState empty="No people matched your search." />}
    {people.items.length > 0 && <LoadMore loading={people.loadingMore} hasMore={people.hasMore} onLoadMore={people.loadMore} label="Load more people" />}
  </div>;
}
