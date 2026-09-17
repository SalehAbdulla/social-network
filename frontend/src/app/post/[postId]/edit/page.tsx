'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { type Post } from '../../../api/social';
import { useBackend } from '../../../components/BackendProvider';
import Loading from '../../../components/Loading';
import { useResource } from '../../../lib/useResource';
import PostForm from '../../../components/PostForm';

export default function EditPost() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useBackend();
  const post = useResource<Post>(`/post?id=${encodeURIComponent(postId)}`);
  const notOwner = !!post.data && post.data.userId !== user.userId;
  // Reported with a toast rather than inline error UI; the route stays put so the
  // reason remains tied to the URL the user asked for (and to the smoke test).
  useEffect(() => {
    if (notOwner) toast.error('You can only edit your own posts.');
  }, [notOwner]);
  if (post.loading) return <Loading />;
  if (!post.data || notOwner) return null;
  return <PostForm key={post.data.postId} post={post.data} />;
}
