'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { type Post } from '../../api/social';
import { useDialogFocus } from '../../lib/useDialogFocus';
import PostView from './PostView';

/**
 * The post dialog: the backdrop, the close X in the viewport's own corner, the prev/next arrows
 * and the `PostView` in the middle. It is a thin shell — everything inside the panel is
 * `PostView`, so the modal and the standalone page are the same component.
 */
export default function PostModal({ post, onClose, onRemoved, onPrev, onNext, group = false, avatarOf, canManage, sharePath, thread, onEdit, onDelete }: {
  post: Post;
  onClose: () => void;
  onRemoved?: (postId: number) => void;
  /** Present only when the opener held a list: the grid, saved, a hashtag, search. */
  onPrev?: () => void;
  onNext?: () => void;
  group?: boolean;
  avatarOf?: (userId: string) => string;
  canManage?: boolean;
  sharePath?: string;
  thread?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  // Escape and Tab belong to the innermost dialog: while a photo viewer or the post's own "…" menu
  // is open the trap stands down, so one Escape closes the innermost thing rather than the post.
  const [nested, setNested] = useState(false);
  const dialog = useDialogFocus<HTMLDivElement>(onClose, { enabled: !nested });
  // The arrows sit just outside the dialog when there is room and fall back to the viewport edge
  // when there is not, so the previous arrow can never land on the rail. Measured from the dialog
  // rather than guessed, because its width follows the media's aspect ratio.
  const [edges, setEdges] = useState<{ prev: number; next: number } | null>(null);
  useEffect(() => {
    const box = dialog.current?.querySelector('.pv-dialog')?.getBoundingClientRect();
    if (!box) return;
    const size = 32, gap = 12, edge = 16;
    setEdges({
      prev: Math.max(edge, Math.round(box.left - size - gap)),
      next: Math.max(edge, Math.round(window.innerWidth - box.right - size - gap)),
    });
  }, [dialog, post.postId]);
  return <>
    <div aria-hidden="true" onClick={onClose} className="pv-scrim" />
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Post"
      className="pv-root"
      onClick={onClose}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' && onPrev) { event.preventDefault(); onPrev(); }
        else if (event.key === 'ArrowRight' && onNext) { event.preventDefault(); onNext(); }
      }}
    >
      <div className="contents" onClick={event => event.stopPropagation()}>
        <PostView key={post.postId} post={post} group={group} avatarOf={avatarOf} canManage={canManage} sharePath={sharePath} thread={thread} onEdit={onEdit} onRemoved={onRemoved} onDelete={onDelete} onNestedChange={setNested} />
      </div>
      <button type="button" className="pv-close" aria-label="Close post" onClick={event => { event.stopPropagation(); onClose(); }}><X aria-hidden="true" /></button>
      {onPrev && <button type="button" className="pv-nav" data-side="prev" style={edges ? { insetInlineStart: edges.prev } : undefined} aria-label="Previous post" onClick={event => { event.stopPropagation(); onPrev(); }}><ChevronLeft aria-hidden="true" /></button>}
      {onNext && <button type="button" className="pv-nav" data-side="next" style={edges ? { insetInlineEnd: edges.next } : undefined} aria-label="Next post" onClick={event => { event.stopPropagation(); onNext(); }}><ChevronRight aria-hidden="true" /></button>}
    </div>
  </>;
}
