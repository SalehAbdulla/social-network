'use client';

import Link from 'next/link';
import { PenSquare, RefreshCw } from 'lucide-react';
import { type Page, type Post } from './api/social';
import { usePagedList } from './lib/usePagedList';
import { useBackend } from './components/BackendProvider';
import StoriesBar from './components/StoriesBar';
import SuggestedPeople from './components/SuggestedPeople';
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
  const { openComposer } = useBackend();
  const feed = usePagedList<Post, Page<Post>>({
    key: FEED_KEY,
    pageQuery: page => `&page=${page}`,
    pageSize: FEED_PAGE_SIZE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
  });

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your feed</h1>
        <p className="text-sm text-slate-500">The latest posts from the people you follow, newest first.</p>
      </div>
      <button type="button" onClick={openComposer} className="chat-primary inline-flex items-center gap-2"><PenSquare size={16} />New post</button>
    </header>
    <StoriesBar />
    <SuggestedPeople />
    {/* Offered, not imposed: a post that arrives over the socket raises this pill, and
        the reader chooses when to fold the newest page in. */}
    <NewPostsNotice onReload={feed.refresh} />
    {feed.refreshing && <p role="status" className="flex items-center justify-center gap-2 text-xs font-medium text-slate-400"><RefreshCw size={13} className="animate-spin" aria-hidden="true" />Refreshing your feed…</p>}
    {feed.loading
      ? <PostListSkeleton />
      : <>
        {feed.items.map(post => <PostCard key={post.postId} post={post} onPostRemoved={postId => feed.update(items => items.filter(item => item.postId !== postId))} />)}
        {feed.settled && !feed.error && feed.items.length === 0 && <RequestState variant="feed" empty="No posts yet. Share your first post to get started." />}
        {feed.settled && !feed.error && feed.items.length === 0 && <Link href="/create-post" className="block text-center text-blue-600">Create a post</Link>}
        {feed.items.length > 0 && <LoadMore loading={feed.loadingMore} hasMore={feed.hasMore} onLoadMore={feed.loadMore} label={`Load${feed.items.length > FEED_PAGE_SIZE ? ' more' : ' older'} posts`} />}
      </>}
  </div>;
}

