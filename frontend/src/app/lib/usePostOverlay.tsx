'use client';

import { useState } from 'react';
import { type Post } from '../api/social';
import { useMediaQuery } from './useMediaQuery';
import PostOverlay from '../components/PostOverlay';

/**
 * The feed's post overlay, for any list of `PostCard`s.
 *
 * `openFor(post)` is a click callback on a wide screen and `undefined` below `lg`, so a phone
 * keeps whatever the page did before — the card's own comment drawer. `overlay` renders the dialog
 * once an open post is set; it is pure state, so the URL is never touched, and `onRemoved` is
 * called when the post is deleted from inside it so the list can drop the row and the dialog can
 * close together. Every surface that shows cards — the feed, a profile, Saved, search, a hashtag —
 * wires it the same way, which is the reason it is a hook rather than four copies of the same state.
 */
export function usePostOverlay(onRemoved: (postId: number) => void) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [post, setPost] = useState<Post | null>(null);
  return {
    /** Use on each card as `onOpen={openFor(post)}`. */
    openFor: (next: Post) => (wide ? () => setPost(next) : undefined),
    overlay: wide && post
      ? <PostOverlay post={post} onClose={() => setPost(null)} onPostRemoved={postId => { onRemoved(postId); setPost(null); }} />
      : null,
  };
}
