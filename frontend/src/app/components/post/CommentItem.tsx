'use client';

import { Heart } from 'lucide-react';
import { type Comment, dateLabel, displayName, isoTimestamp, relativeLabel } from '../../api/social';
import { linkify } from '../../lib/linkify';
import Avatar from '../Avatar';
import Menu, { MenuItem } from '../ui/Menu';

export default function CommentItem({ comment, canManage, avatarUrl, busy, onLike, onDelete, onOpenPhoto }: {
  comment: Comment;
  canManage: boolean;
  avatarUrl?: string;
  busy: boolean;
  onLike: () => void;
  onDelete: () => void;
  onOpenPhoto: (images: string[], index: number) => void;
}) {
  const name = displayName(comment);
  const liked = comment.userScore === 1;
  const photos = comment.imageUrls ?? [];
  return <div className="pv-cmt">
    <Avatar name={name} avatarUrl={avatarUrl} size={32} />
    <div className="min-w-0 flex-1">
      <p className="pv-body" dir="auto"><span className="pv-name">{name}</span>{' '}{linkify(comment.commentText)}</p>
      {photos.map((url, index) => (
        <button key={url} type="button" className="pv-photo" aria-label={`Open comment photo ${index + 1} of ${photos.length}`} onClick={() => onOpenPhoto(photos, index)}>
          <img src={url} alt="Comment attachment" className="w-full" />
        </button>
      ))}
      <p className="pv-line">
        <time dateTime={isoTimestamp(comment.createdAt)} title={dateLabel(comment.createdAt)}>{relativeLabel(comment.createdAt)}</time>
        {comment.score > 0 && <>{' · '}{comment.score} {comment.score === 1 ? 'like' : 'likes'}</>}
      </p>
    </div>
    <button type="button" className="pv-cmt-like" data-liked={liked} aria-label={liked ? 'Unlike comment' : 'Like comment'} disabled={busy} onClick={onLike}><Heart fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /></button>
    {canManage && <div className="pv-cmt-menu"><Menu label="Comment options" align="end"><MenuItem tone="danger" onClick={onDelete}>Delete</MenuItem></Menu></div>}
  </div>;
}
