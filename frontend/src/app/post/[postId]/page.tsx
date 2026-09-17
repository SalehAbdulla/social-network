'use client';
import { useParams, useRouter } from 'next/navigation';
import { type Post } from '../../api/social';
import { useResource } from '../../lib/useResource';
import PostCard from '../../components/PostCard';
import Loading from '../../components/Loading';
export default function SinglePost() {
  const { postId } = useParams<{ postId: string }>();
  const router = useRouter();
  const post = useResource<Post>(`/post?id=${postId}`);
  return <div className="mx-auto max-w-3xl p-6 space-y-5"><button onClick={() => router.push('/')} className="text-blue-600">Back to feed</button>{post.loading && <Loading />}{post.data && <PostCard post={post.data} fetchPosts={post.reload} />}</div>;
}
