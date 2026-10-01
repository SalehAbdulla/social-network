'use client';

import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { type Page, type Post } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import PostCard from '../components/PostCard';
import RequestState from '../components/RequestState';
import LoadMore from '../components/LoadMore';
import { PostListSkeleton } from '../components/Skeletons';

const SAVED_PAGE_SIZE = 10;
// Everything except the page number is the identity of this list: if it ever
// changes (a filter, a new sort) `usePagedList` restarts from page 1.
const SAVED_KEY = `/saved-posts?size=${SAVED_PAGE_SIZE}`;

/*
 * The bookmark list. It is private to the signed-in member, which is why it is a
 * route of its own rather than a tab on the profile page — that page is shared
 * with every other member's profile, and a private list cannot live on it. The
 * list is filtered by the same post-visibility rule as the feed, so a saved post
 * the reader can no longer see is simply absent.
 */
export default function Saved() {
  const saved = usePagedList<Post, Page<Post>>({
    key: SAVED_KEY,
    pageQuery: page => `&page=${page}`,
    pageSize: SAVED_PAGE_SIZE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
  });

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900"><Bookmark size={22} aria-hidden="true" />Saved posts</h1>
        <p className="text-sm text-slate-500">Only you can see this list. A post you can no longer read drops out of it.</p>
      </div>
      <Link href="/" className="chat-primary inline-flex items-center gap-2">Back to feed</Link>
    </header>
    {saved.refreshing && <p role="status" className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400">Refreshing your saved posts…</p>}
    {saved.loading
      ? <PostListSkeleton />
      : <>
        {saved.items.map(post => <PostCard
          key={post.postId}
          post={post}
          onPostRemoved={postId => saved.update(items => items.filter(item => item.postId !== postId))}
          onUnsaved={postId => saved.update(items => items.filter(item => item.postId !== postId))}
        />)}
        {saved.settled && !saved.error && saved.items.length === 0 && <RequestState empty="Nothing saved yet. Use the bookmark button on a post to keep it here." />}
        {saved.items.length > 0 && <LoadMore loading={saved.loadingMore} hasMore={saved.hasMore} onLoadMore={saved.loadMore} label="Load more saved posts" />}
      </>}
  </div>;
}
