'use client';
import { useParams } from 'next/navigation';
import { type Post } from '../../../api/social';
import { useBackend } from '../../../components/BackendProvider';
import Loading from '../../../components/Loading';
import RequestState from '../../../components/RequestState';
import { useResource } from '../../../lib/useResource';
import { PostForm } from '../../../pages/CreatePost';

export default function EditPost() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useBackend();
  const post = useResource<Post>(`/post?id=${encodeURIComponent(postId)}`);
  if (post.loading) return <Loading />;
  if (post.error) return <RequestState error={post.error} retry={post.reload} />;
  if (!post.data) return null;
  if (post.data.userId !== user.userId) return <RequestState error="You can only edit your own posts." />;
  return <PostForm key={post.data.postId} post={post.data} />;
}
