'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { type Page, type Post } from './api/social';
import { usePagedList } from './lib/usePagedList';
import { useMediaQuery } from './lib/useMediaQuery';
import StoriesBar from './components/StoriesBar';
import SuggestedPeople from './components/SuggestedPeople';
import AccountRailCard from './components/AccountRailCard';
import PostCard from './components/PostCard';
import PostOverlay from './components/PostOverlay';
import RequestState from './components/RequestState';
import LoadMore from './components/LoadMore';
import NewPostsNotice from './components/NewPostsNotice';
import { PostListSkeleton } from './components/Skeletons';

const FEED_PAGE_SIZE = 10;
// Everything except the page number is the identity of this list: if it ever
// changes (a filter, a new sort) `usePagedList` restarts from page 1.
const FEED_KEY = `/posts?size=${FEED_PAGE_SIZE}&sortBy=createdat&sortOrder=desc`;

export default function Feed() {
  const feed = usePagedList<Post, Page<Post>>({
    key: FEED_KEY,
    pageQuery: page => `&page=${page}`,
    pageSize: FEED_PAGE_SIZE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
  });
  // The overlay belongs to the feed, not the shell: only this list opens it, and only on a wide
  // screen, where a card stops being a route link and becomes the thing Instagram pops open.
  // Rendering is gated on `wide` rather than clearing state on a resize, so a desktop dialog can
  // never be left sitting over a phone layout. Creating a post is not offered here — the sidebar
  // owns it on a desktop and the bottom bar on a phone (the one-surface-per-breakpoint rule) — and
  // the page carries no title of its own, the way Instagram's feed does not.
  const wide = useMediaQuery('(min-width: 1024px)');
  const [openPost, setOpenPost] = useState<Post | null>(null);

  return <div className="mx-auto max-w-5xl space-y-6 p-4 py-8 sm:p-8">
    {/* Instagram's desktop feed is a centred column with the suggestions rail beside it, and the
        rail simply dropped below `xl` rather than moved — which is why the column centres itself
        until the two-column grid can hold both. The rail is `sticky` so it stays put while the
        feed scrolls past it. */}
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-6 xl:mx-0 xl:max-w-none">
    <StoriesBar />
    {/* Offered, not imposed: a post that arrives over the socket raises this pill, and
        the reader chooses when to fold the newest page in. */}
    <NewPostsNotice onReload={feed.refresh} />
    {feed.refreshing && <p role="status" className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400"><RefreshCw size={13} className="animate-spin" aria-hidden="true" />Refreshing your feed…</p>}
    {feed.loading
      ? <PostListSkeleton />
      : <>
        {feed.items.map(post => <PostCard key={post.postId} post={post} onOpen={wide ? () => setOpenPost(post) : undefined} onPostRemoved={postId => feed.update(items => items.filter(item => item.postId !== postId))} />)}
        {feed.settled && !feed.error && feed.items.length === 0 && <RequestState variant="feed" empty="No posts yet. Share your first post to get started." />}
        {feed.settled && !feed.error && feed.items.length === 0 && <Link href="/create-post" className="block text-center text-blue-600">Create a post</Link>}
        {feed.items.length > 0 && <LoadMore loading={feed.loadingMore} hasMore={feed.hasMore} onLoadMore={feed.loadMore} label={`Load${feed.items.length > FEED_PAGE_SIZE ? ' more' : ' older'} posts`} />}
      </>}
    </div>
    <aside className="hidden xl:block"><div className="sticky top-6 space-y-6"><AccountRailCard /><SuggestedPeople /></div></aside>
    </div>
    {/* Pure state, outside the grid: `/post/{postId}` stays the deep link (hard load, refresh, the
        Share button's copied URL) and closing the overlay just drops this state. */}
    {wide && openPost && <PostOverlay post={openPost} onClose={() => setOpenPost(null)} onPostRemoved={postId => { feed.update(items => items.filter(item => item.postId !== postId)); setOpenPost(null); }} />}
  </div>;
}

