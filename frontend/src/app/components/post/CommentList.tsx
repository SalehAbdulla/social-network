'use client';

import { Plus } from 'lucide-react';
import { type Comment } from '../../api/social';
import Button from '../ui/Button';
import CommentItem from './CommentItem';

export default function CommentList({ items, loading, error, settled, hasMore, loadingMore, meId, isOwner, avatarOf, busyId, onLike, onDelete, onRetry, onLoadMore, onOpenPhoto }: {
  items: Comment[];
  loading: boolean;
  error: string;
  settled: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  meId: string;
  isOwner: boolean;
  avatarOf?: (userId: string) => string;
  busyId: number | null;
  onLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenPhoto: (images: string[], index: number) => void;
}) {
  if (loading) return <div className="pv-cmts" aria-busy="true">
    {[0, 1, 2].map(row => <div key={row} className="pv-skel"><span className="size-8 shrink-0" style={{ borderRadius: '9999px' }} /><span className="h-3.5 flex-1" /></div>)}
  </div>;
  if (error) return <div className="pv-state"><p className="pv-state-text">Couldn&apos;t load comments</p><Button variant="secondary" onClick={onRetry}>Retry</Button></div>;
  if (settled && items.length === 0) return <div className="pv-state"><p className="pv-state-title">No comments yet.</p><p className="pv-state-text">Start the conversation.</p></div>;
  return <div className="pv-cmts" aria-live="polite">
    {items.map(comment => <CommentItem
      key={comment.commentId}
      comment={comment}
      canManage={isOwner || comment.userId === meId}
      avatarUrl={avatarOf?.(comment.userId)}
      busy={busyId === comment.commentId}
      onLike={() => onLike(comment)}
      onDelete={() => onDelete(comment)}
      onOpenPhoto={onOpenPhoto}
    />)}
    {hasMore && <div className="pv-more-row">
      <button type="button" className="pv-more-btn" aria-label="Load more comments" aria-busy={loadingMore} disabled={loadingMore} onClick={onLoadMore}><Plus aria-hidden="true" /></button>
    </div>}
  </div>;
}
