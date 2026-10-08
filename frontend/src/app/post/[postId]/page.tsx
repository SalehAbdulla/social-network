'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type Post, displayName } from '../../api/social';
import { useResource } from '../../lib/useResource';
import { usePagedList } from '../../lib/usePagedList';
import PostView from '../../components/post/PostView';
import PostTile from '../../components/profile/PostTile';
import PostInsights from '../../components/PostInsights';
import Loading from '../../components/Loading';

export default function SinglePost() {
  const { postId } = useParams<{ postId: string }>();
  const router = useRouter();
  const post = useResource<Post>(`/post?id=${postId}`);
  const author = post.data?.userId;
  const more = usePagedList<Post, Post[]>({
    key: author ? `/users/${author}/posts?size=7` : '',
    pageQuery: page => `&page=${page}`,
    pageSize: 7,
    normalize: raw => ({ items: raw, hasMore: false }),
    keyOf: item => item.postId,
    enabled: !!author,
  });
  const others = more.items.filter(item => item.postId !== post.data?.postId).slice(0, 6);
  return <div className="px-4 py-6">
    {post.loading && <Loading />}
    {!!post.error && !post.loading && <div className="pv-state">
      <p className="pv-state-title">This post isn&apos;t available.</p>
      <Link href="/" className="pv-post">Go back to Feed</Link>
    </div>}
    {post.data && <>
      <div className="pv-page"><PostView post={post.data} onRemoved={() => router.push('/')} /></div>
      {others.length > 0 && <div className="pv-more-posts">
        <p className="pv-more-title">More posts from {displayName(post.data)}</p>
        <div className="profile-grid">{others.map(item => <PostTile key={item.postId} post={item} onOpen={() => router.push(`/post/${item.postId}`)} />)}</div>
      </div>}
      <PostInsights post={post.data} />
    </>}
  </div>;
}

