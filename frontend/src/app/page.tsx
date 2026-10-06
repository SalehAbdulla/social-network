'use client';

import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { type Page, type Post } from './api/social';
import { usePagedList } from './lib/usePagedList';
import { usePostOverlay } from './lib/usePostOverlay';
import StoriesBar from './components/StoriesBar';
import SuggestedPeople from './components/SuggestedPeople';
import AccountRailCard from './components/AccountRailCard';
import PostCard from './components/PostCard';
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
  // screen, where a card stops being a route link and becomes the thing Instagram pops open. It is
  // pure state — `/post/{postId}` stays the deep link — so the page never touches the URL, and it
  // carries no title of its own, the way Instagram's feed does not.
  const { openFor, overlay } = usePostOverlay(postId => feed.update(items => items.filter(item => item.postId !== postId)));

  // Instagram's desktop feed: a 470px column and a 319px suggestions rail 64px to its right, wrapped
  // as one group and centred as one — 853px of it — in the content area, so the pair sits in the
  // middle of the page to the right of the rail. `max-content` is what lets that centring follow the
  // rail: with the rail shown the group is both columns, and once it is hidden the group is the column
  // alone, which then centres itself. `max-w-full` keeps the group inside the page on a narrow screen,
  // where the column's own `max-w-full` lets it come down from 470px instead of overflowing. The
  // numbers are geometry tokens in globals.css.
  return <div className="px-4 pt-[var(--feed-top)] pb-4">
    <div className="mx-auto flex w-max max-w-full">
    <div className="w-[var(--feed-width)] max-w-full shrink-0 space-y-[var(--post-spacing)]">
    <StoriesBar />
    {/* Offered, not imposed: a post that arrives over the socket raises this pill, and
        the reader chooses when to fold the newest page in. */}
    <NewPostsNotice onReload={feed.refresh} />
    {feed.refreshing && <p role="status" className="flex items-center justify-center gap-2 text-xs font-medium text-muted"><RefreshCw size={13} className="animate-spin" aria-hidden="true" />Refreshing your feed…</p>}
    {feed.loading
      ? <PostListSkeleton />
      : <>
        {feed.items.map(post => <PostCard key={post.postId} post={post} onOpen={openFor(post)} onPostRemoved={postId => feed.update(items => items.filter(item => item.postId !== postId))} />)}
        {feed.settled && !feed.error && feed.items.length === 0 && <RequestState variant="feed" empty="No posts yet. Share your first post to get started." />}
        {feed.settled && !feed.error && feed.items.length === 0 && <Link href="/create-post" className="block text-center text-brand-1">Create a post</Link>}
        {feed.items.length > 0 && <LoadMore loading={feed.loadingMore} hasMore={feed.hasMore} onLoadMore={feed.loadMore} label={`Load${feed.items.length > FEED_PAGE_SIZE ? ' more' : ' older'} posts`} />}
      </>}
    </div>
    <aside className="ml-[var(--feed-gap)] hidden w-[var(--feed-rail)] shrink-0 min-[1000px]:block"><div className="sticky top-[var(--feed-top)] space-y-6"><AccountRailCard /><SuggestedPeople /></div></aside>
    </div>
    {overlay}
  </div>;
}

