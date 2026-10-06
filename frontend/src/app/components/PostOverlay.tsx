'use client';

import { useState } from 'react';
import { type Post } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';
import PostCard from './PostCard';

/**
 * The feed's Instagram-style post: a pop-up over the list with the media on the left and the
 * header, caption, the post's actions and the comments on the right. It is the same `PostCard` in
 * its `overlay` layout, so a like, a save, a delete and a comment are one implementation rather
 * than a copy.
 *
 * It is deliberately pure state and does not touch the URL. `/post/{postId}` stays the deep link
 * it always was — a hard load, a refresh and the Share button's copied link all still render that
 * page — and driving the overlay's own URL would mean either a route interception (which is
 * viewport-blind and would swallow the phone's plain navigation) or a manual `history.pushState`,
 * which the App Router repaints by URL (`app-router.js` `applyUrlFromHistoryPushReplace`). Escape,
 * the backdrop and the close control close it, and `useDialogFocus` returns focus to whatever
 * opened it — the same contract as `ComposerDialog` and `Lightbox`.
 */
export default function PostOverlay({ post, onClose, onPostRemoved }: {
  post: Post;
  onClose: () => void;
  /** Drop the deleted row and close, so the feed behind the dialog cannot keep a dead card. */
  onPostRemoved?: (postId: number) => void;
}) {
  // Escape and Tab belong to the innermost dialog: while a photo viewer or this post's own "…" menu
  // is open inside the overlay the trap stands down, which is the rule `StoryArchive` already
  // follows for the story viewer. Without it a single Escape would close both.
  const [nestedDialog, setNestedDialog] = useState(false);
  const dialog = useDialogFocus<HTMLDivElement>(onClose, { enabled: !nestedDialog });
  return <>
    <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm" />
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Post" onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 outline-none">
      {/* The backdrop is a sibling of the panel rather than its parent, the same reason the comment
          sheet and the composer draw it that way: `backdrop-filter` makes an element the containing
          block for `position: fixed` descendants. */}
      <div onClick={event => event.stopPropagation()} className="w-[min(68rem,94vw)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <PostCard key={post.postId} post={post} variant="overlay" onClose={onClose} onPostRemoved={onPostRemoved} onNestedDialogChange={setNestedDialog} />
      </div>
    </div>
  </>;
}
