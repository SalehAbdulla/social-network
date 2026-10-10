'use client';

import { Suspense, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { type Page, type Post } from './api/social';
import { usePagedList } from './lib/usePagedList';
import { usePostModal } from './lib/usePostModal';
import { useCreatePost } from './lib/useCreatePost';
import StoriesBar from './components/StoriesBar';
import RightRail from './components/RightRail';
import PostCard from './components/PostCard';
import RequestState from './components/RequestState';
import LoadMore from './components/LoadMore';
import NewPostsNotice from './components/NewPostsNotice';
import { PostListSkeleton } from './components/Skeletons';

const FEED_PAGE_SIZE = 10;
const FEED_KEY = `/posts?size=${FEED_PAGE_SIZE}&sortBy=createdat&sortOrder=desc`;

function FeedScreen() {
  const feed = usePagedList<Post, Page<Post>>({
    key: FEED_KEY,
    pageQuery: page => `&page=${page}`,
    pageSize: FEED_PAGE_SIZE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
  });
  const { openFor, modal } = usePostModal(feed.items, postId => feed.update(items => items.filter(item => item.postId !== postId)));

  const { update } = feed;
  // A post can be created from the sidebar or the bottom nav, where the feed does
  // not own the modal. Listening for the broadcast keeps the list current
  // whichever button was pressed, instead of waiting for a reload.
  useEffect(() => {
    const onCreated = (event: Event) => {
      const post = (event as CustomEvent<Post>).detail;
      if (!post) return;
      update(items => items.some(item => item.postId === post.postId) ? items : [post, ...items]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('social:post_created', onCreated);
    return () => window.removeEventListener('social:post_created', onCreated);
  }, [update]);

  const create = useCreatePost({ context: 'feed' });

  return <div className="px-4 pt-[var(--feed-top)] pb-4">
    <div className="mx-auto flex w-max max-w-full">
    <div className="w-[var(--feed-width)] max-w-full shrink-0 space-y-[var(--post-spacing)]">
    <StoriesBar />
    <NewPostsNotice onReload={feed.refresh} />
    {feed.refreshing && <p role="status" className="flex items-center justify-center gap-2 text-xs font-medium text-muted"><RefreshCw size={13} className="animate-spin" aria-hidden="true" />Refreshing your feed…</p>}
    {feed.loading
      ? <PostListSkeleton />
      : <>
        {feed.items.map(post => <PostCard key={post.postId} post={post} onOpen={openFor(post)} onPostRemoved={postId => feed.update(items => items.filter(item => item.postId !== postId))} />)}
        {feed.settled && !feed.error && feed.items.length === 0 && <RequestState variant="feed" empty="No posts yet. Share your first post to get started." />}
        {feed.settled && !feed.error && feed.items.length === 0 && <button type="button" onClick={create.open} className="block w-full text-center text-brand-1">Create a post</button>}
        {feed.items.length > 0 && <LoadMore loading={feed.loadingMore} hasMore={feed.hasMore} onLoadMore={feed.loadMore} label={`Load${feed.items.length > FEED_PAGE_SIZE ? ' more' : ' older'} posts`} />}
      </>}
    </div>
    <aside className="ml-[var(--feed-gap)] hidden w-[var(--feed-rail)] shrink-0 min-[1000px]:block"><div className="pb-[var(--rc-safe-bottom)]"><RightRail /></div></aside>
    </div>
    {modal}
    {create.modal}
  </div>;
}

export default function Feed() {
  return <Suspense fallback={<PostListSkeleton />}><FeedScreen /></Suspense>;
}

