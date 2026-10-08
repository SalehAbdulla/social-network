'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { type Page, type Post } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { usePostModal } from '../lib/usePostModal';
import PostCard from '../components/PostCard';
import RequestState from '../components/RequestState';
import LoadMore from '../components/LoadMore';
import { PostListSkeleton } from '../components/Skeletons';

const SAVED_PAGE_SIZE = 10;
const SAVED_KEY = `/saved-posts?size=${SAVED_PAGE_SIZE}`;

function SavedScreen() {
  const saved = usePagedList<Post, Page<Post>>({
    key: SAVED_KEY,
    pageQuery: page => `&page=${page}`,
    pageSize: SAVED_PAGE_SIZE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
  });
  const { openFor, modal } = usePostModal(saved.items, postId => saved.update(items => items.filter(item => item.postId !== postId)));

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
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
    {modal}
  </div>;
}

export default function Saved() {
  return <Suspense fallback={<PostListSkeleton />}><SavedScreen /></Suspense>;
}
