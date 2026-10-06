'use client';

import { FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search as SearchIcon, X } from 'lucide-react';
import { type Group, type Page, type Post, type SocialUser, displayName } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { usePostOverlay } from '../lib/usePostOverlay';
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../lib/recentSearches';
import Avatar from '../components/Avatar';
import LoadMore from '../components/LoadMore';
import PostCard from '../components/PostCard';
import RequestState from '../components/RequestState';
import { PostListSkeleton, RowsSkeleton } from '../components/Skeletons';

const POSTS_PER_PAGE = 10;

/**
 * One page, three answers.
 *
 * The people and group halves are the endpoints that already had a `q`; the post
 * half is `/posts/search`, added with this page. Nothing is merged or re-ranked
 * across the three — each endpoint keeps its own rule about what the viewer may see,
 * which is exactly why the page asks them separately rather than through a single
 * query that would have to re-implement all of them.
 */
function SearchScreen() {
  const router = useRouter();
  const query = (useSearchParams().get('q') ?? '').trim();
  const [input, setInput] = useState(query);
  const [recent, setRecent] = useState<string[]>([]);

  // Storage is read after mount and inside a task rather than in the effect body, for
  // the reason `PostForm` does the same: the server and the first client render agree
  // on an empty list, so hydration cannot mismatch.
  useEffect(() => {
    const timer = window.setTimeout(() => setRecent(readRecentSearches()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  // A chip, a link or the back button changes the URL, which is the source of truth.
  useEffect(() => {
    const timer = window.setTimeout(() => setInput(query), 0);
    return () => window.clearTimeout(timer);
  }, [query]);

  const run = useCallback((term: string) => {
    const next = term.trim();
    if (!next) return;
    setInput(next);
    setRecent(rememberSearch(next));
    router.replace(`/search?q=${encodeURIComponent(next)}`);
  }, [router]);

  const encoded = encodeURIComponent(query);
  const people = useResource<SocialUser[]>(`/users?q=${encoded}`, !!query);
  const groups = useResource<Group[]>(`/groups?q=${encoded}`, !!query);
  const posts = usePagedList<Post, Page<Post>>({
    key: `/posts/search?q=${encoded}&size=${POSTS_PER_PAGE}`,
    pageQuery: page => `&page=${page}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
    enabled: !!query,
  });

  const { openFor, overlay } = usePostOverlay(postId => posts.update(items => items.filter(item => item.postId !== postId)));

  const matchedNothing = !!query
    && !people.loading && !groups.loading && !posts.loading
    && !people.error && !groups.error && !posts.error
    && people.data?.length === 0 && groups.data?.length === 0 && posts.items.length === 0;

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <header className="space-y-3">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Search</h1>
      <form role="search" className="flex gap-2" onSubmit={(event: FormEvent) => { event.preventDefault(); run(input); }}>
        <input aria-label="Search posts, people and groups" value={input} onChange={event => setInput(event.target.value)} placeholder="Search posts, people and groups" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3" />
        <button className="chat-primary inline-flex items-center gap-2"><SearchIcon size={16} aria-hidden="true" />Search</button>
      </form>
      {!query && (recent.length > 0
        ? <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-slate-500">Recent</span>{recent.map(term => <button key={term} type="button" onClick={() => run(term)} className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-sm text-muted hover:text-brand-1">{term}</button>)}<button type="button" aria-label="Clear recent searches" onClick={() => { clearRecentSearches(); setRecent([]); }} className="ml-1 inline-flex items-center gap-1 text-xs text-muted underline"><X size={12} aria-hidden="true" />Clear</button></div>
        : <p className="text-sm text-slate-500">Search for a person, a group, or something someone wrote.</p>)}
    </header>

    {query && <>
      {people.loading
        ? <RowsSkeleton count={2} />
        : people.data && people.data.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold">People</h2>
          <ul className="space-y-2">{people.data.map(person => <li key={person.userId}>
            <Link href={`/profile/${person.userId}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <Avatar name={displayName(person)} avatarUrl={person.avatar} />
              <span className="min-w-0"><span className="block truncate font-medium">{displayName(person)}</span><span className="block truncate text-sm text-slate-500">@{person.nickname}</span></span>
            </Link>
          </li>)}</ul>
        </section>}

      {groups.loading
        ? <RowsSkeleton count={2} />
        : groups.data && groups.data.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold">Groups</h2>
          <ul className="space-y-2">{groups.data.map(group => <li key={group.groupId}>
            <Link href={`/messages/groups/${group.groupId}`} className="block rounded-xl border border-border bg-card p-3">
              <span className="block font-medium">{group.title}</span>
              <span className="block truncate text-sm text-slate-500">{group.description || `${group.memberCount} member${group.memberCount === 1 ? '' : 's'}`}</span>
            </Link>
          </li>)}</ul>
        </section>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Posts</h2>
        {posts.loading
          ? <PostListSkeleton />
          : <>
            {posts.items.map(post => <PostCard key={post.postId} post={post} onOpen={openFor(post)} onPostRemoved={postId => posts.update(items => items.filter(item => item.postId !== postId))} />)}
            {posts.items.length > 0 && <LoadMore loading={posts.loadingMore} hasMore={posts.hasMore} onLoadMore={posts.loadMore} label="Load more posts" />}
          </>}
      </section>

      {matchedNothing && <RequestState empty={`Nothing matched “${query}”. Try another word, or a spelling.`} />}
    </>}
    {overlay}
  </div>;
}

export default function Search() {
  // useSearchParams needs a Suspense boundary around it, which this default export
  // provides — the same shape the reset page uses for its token.
  return <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading search…</p>}><SearchScreen /></Suspense>;
}
