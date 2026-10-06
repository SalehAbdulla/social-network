'use client';

import Link from 'next/link';
import { type Page, type Post } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { usePostOverlay } from '../lib/usePostOverlay';
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
  // The same overlay the feed opens, so a card here is not a second, older behaviour.
  const { openFor, overlay } = usePostOverlay(postId => saved.update(items => items.filter(item => item.postId !== postId)));

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    {/* No page title: the rail already names this page, and the note that the list is private is
        the same rule the backend enforces rather than a label worth repeating. */}
    <div className="flex justify-end"><Link href="/" className="chat-secondary inline-flex items-center gap-2">Back to feed</Link></div>
    {saved.refreshing && <p role="status" className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400">Refreshing your saved posts…</p>}
    {saved.loading
      ? <PostListSkeleton />
      : <>
        {saved.items.map(post => <PostCard
          key={post.postId}
          post={post}
          onOpen={openFor(post)}
          onPostRemoved={postId => saved.update(items => items.filter(item => item.postId !== postId))}
          onUnsaved={postId => saved.update(items => items.filter(item => item.postId !== postId))}
        />)}
        {saved.settled && !saved.error && saved.items.length === 0 && <RequestState empty="Nothing saved yet. Use the bookmark button on a post to keep it here." />}
        {saved.items.length > 0 && <LoadMore loading={saved.loadingMore} hasMore={saved.hasMore} onLoadMore={saved.loadMore} label="Load more saved posts" />}
      </>}
    {overlay}
  </div>;
}
