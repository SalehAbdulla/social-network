'use client';

import { useCallback, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type Post } from '../api/social';
import PostModal from '../components/post/PostModal';

export interface PostModalExtra {
  group?: boolean;
  avatarOf?: (userId: string) => string;
  canManage?: boolean;
  sharePath?: string;
  thread?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function usePostModal(items: Post[], onRemoved: (postId: string) => void, extra?: (post: Post) => PostModalExtra) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const id = searchParams.get('post');
  const index = id === null ? -1 : items.findIndex(post => post.postId === id);
  const post = index >= 0 ? items[index] : null;

  const navigate = useCallback((nextId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId === null) params.delete('post'); else params.set('post', nextId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return {
    openFor: (target: Post) => () => navigate(target.postId),
    openById: (postId: string) => navigate(postId),
    modal: post
      ? <PostModal
        key={post.postId}
        post={post}
        {...(extra?.(post) ?? {})}
        onClose={() => navigate(null)}
        onRemoved={postId => { onRemoved(postId); navigate(null); }}
        onPrev={index > 0 ? () => navigate(items[index - 1].postId) : undefined}
        onNext={index < items.length - 1 ? () => navigate(items[index + 1].postId) : undefined}
      />
      : null,
  };
}
