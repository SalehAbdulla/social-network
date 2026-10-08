'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { type Page, type Post } from '../../api/social';
import { usePagedList } from '../../lib/usePagedList';
import { usePostModal } from '../../lib/usePostModal';
import PostCard from '../../components/PostCard';
import RequestState from '../../components/RequestState';
import LoadMore from '../../components/LoadMore';
import { PostListSkeleton } from '../../components/Skeletons';

const POSTS_PER_PAGE = 10;

function HashtagScreen() {
  const tag = String(useParams<{ tag?: string }>().tag ?? '').toLowerCase();
  const posts = usePagedList<Post, Page<Post>>({
    key: `/hashtags/${encodeURIComponent(tag)}?size=${POSTS_PER_PAGE}`,
    pageQuery: page => `&page=${page}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
    enabled: !!tag,
  });
  const { openFor, modal } = usePostModal(posts.items, postId => posts.update(items => items.filter(item => item.postId !== postId)));

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <header>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">#{tag}</h1>
      <p className="text-sm text-slate-500">Posts carrying this tag, newest first.</p>
    </header>
    {posts.loading
      ? <PostListSkeleton />
      : <>
        {posts.items.map(post => <PostCard key={post.postId} post={post} onOpen={openFor(post)} onPostRemoved={postId => posts.update(items => items.filter(item => item.postId !== postId))} />)}
        {posts.settled && posts.error && <RequestState empty={`#${tag} is not a tag this app can look up.`} />}
        {posts.settled && !posts.error && posts.items.length === 0 && <RequestState empty={`Nothing carries #${tag} yet.`} />}
        {posts.items.length > 0 && <LoadMore loading={posts.loadingMore} hasMore={posts.hasMore} onLoadMore={posts.loadMore} label="Load more posts" />}
      </>}
    {modal}
  </div>;
}

export default function Hashtag() {
  return <Suspense fallback={<PostListSkeleton />}><HashtagScreen /></Suspense>;
}
