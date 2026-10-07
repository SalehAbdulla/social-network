'use client';

import { useCallback, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type Post } from '../api/social';
import PostModal from '../components/post/PostModal';

/** Per-post overrides for a surface that is not the feed: a group post, a shared avatar lookup. */
export interface PostModalExtra {
  group?: boolean;
  avatarOf?: (userId: string) => string;
  canManage?: boolean;
  sharePath?: string;
  /** A group's own thread, drawn inside the panel where the feed's comments would be. */
  thread?: ReactNode;
  onEdit?: () => void;
  /** Overrides the built-in delete, for a post that is not in the `post` table (a group post). */
  onDelete?: () => void;
}

/**
 * One post modal for every list of posts.
 *
 * `openFor(post)` reflects the post into `?post=<id>`, so a refresh reopens it and the browser's
 * back button closes it; `modal` renders the shared `PostModal`, handed the list's own order so
 * the arrows step through it. `onRemoved` lets the list drop a deleted row. Every surface that
 * shows posts — the feed, a profile grid, saved, search, a hashtag, a group — wires it the same
 * way, which is why there is one hook rather than a copy of this state per page.
 */
export function usePostModal(items: Post[], onRemoved: (postId: string) => void, extra?: (post: Post) => PostModalExtra) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // `?post=` carries the post's public UUID (see migration 000020), so it is read and written as
  // text and never coerced to a number.
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
    /** Use on each card or tile as `onOpen={openFor(post)}`. */
    openFor: (target: Post) => () => navigate(target.postId),
    /** Set `?post=` without a tile, e.g. a notification or a deep link. */
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
