'use client';

import { useParams } from 'next/navigation';
import { type Page, type Post } from '../../api/social';
import { usePagedList } from '../../lib/usePagedList';
import PostCard from '../../components/PostCard';
import RequestState from '../../components/RequestState';
import LoadMore from '../../components/LoadMore';
import { PostListSkeleton } from '../../components/Skeletons';

const POSTS_PER_PAGE = 10;

/*
 * One tag's posts. The tag is the whole identity of the list, so a different one restarts
 * from page 1 — and the results are the feed's own visibility rule, applied by the
 * endpoint, which is why a post the reader may not open is simply absent rather than
 * hidden here. The tag is lowercased to match what the linkifier produces.
 */
export default function Hashtag() {
  const tag = String(useParams<{ tag?: string }>().tag ?? '').toLowerCase();
  const posts = usePagedList<Post, Page<Post>>({
    key: `/hashtags/${encodeURIComponent(tag)}?size=${POSTS_PER_PAGE}`,
    pageQuery: page => `&page=${page}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
    enabled: !!tag,
  });

  return <div className="mx-auto max-w-3xl space-y-6 p-4 py-8 sm:p-8">
    <header>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">#{tag}</h1>
      <p className="text-sm text-slate-500">Posts carrying this tag, newest first.</p>
    </header>
    {posts.loading
      ? <PostListSkeleton />
      : <>
        {posts.items.map(post => <PostCard key={post.postId} post={post} onPostRemoved={postId => posts.update(items => items.filter(item => item.postId !== postId))} />)}
        {posts.settled && posts.error && <RequestState empty={`#${tag} is not a tag this app can look up.`} />}
        {posts.settled && !posts.error && posts.items.length === 0 && <RequestState empty={`Nothing carries #${tag} yet.`} />}
        {posts.items.length > 0 && <LoadMore loading={posts.loadingMore} hasMore={posts.hasMore} onLoadMore={posts.loadMore} label="Load more posts" />}
      </>}
  </div>;
}
