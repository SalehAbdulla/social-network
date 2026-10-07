'use client';

import { Heart, Send } from 'lucide-react';

/**
 * The story card's bottom row. For someone else's story it is the reply pill plus the heart
 * and send buttons; for your own story the reply box is replaced by the "Seen by" control,
 * because you do not reply to yourself — the author reads the replies, and the viewers are
 * the thing only they can see.
 */
export default function StoryFooter({ isOwn, nickname, viewerCount, replyCount, onOpenViewers, onOpenReplies, liked, likeCount, onToggleLike, reply, onReplyChange, onReplyFocus, onReplyBlur, onSendReply, sending, sent }: {
  isOwn: boolean;
  nickname: string;
  viewerCount: number;
  replyCount: number;
  onOpenViewers: () => void;
  onOpenReplies: () => void;
  liked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  reply: string;
  onReplyChange: (value: string) => void;
  onReplyFocus: () => void;
  onReplyBlur: () => void;
  onSendReply: () => void;
  sending: boolean;
  sent: boolean;
}) {
  if (isOwn) return <div className="story-foot story-foot-own">
    <button type="button" className="story-activity-btn" aria-haspopup="dialog" onClick={onOpenViewers}>
      {viewerCount > 0 ? `Seen by ${viewerCount}` : 'No views yet'}
    </button>
    {replyCount > 0 && <button type="button" className="story-activity-btn" aria-haspopup="dialog" onClick={onOpenReplies}>{`Replies ${replyCount}`}</button>}
  </div>;

  return <form className="story-foot" onSubmit={event => { event.preventDefault(); onSendReply(); }}>
    <input
      className="story-reply"
      value={reply}
      onChange={event => onReplyChange(event.target.value)}
      onFocus={onReplyFocus}
      onBlur={onReplyBlur}
      maxLength={1000}
      placeholder={`Reply to ${nickname}…`}
      aria-label="Reply to story"
    />
    {sent ? <span className="story-sent" role="status">Sent</span> : null}
    <button type="button" className={`story-heart ${liked ? 'is-liked' : ''}`} aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'} onClick={onToggleLike}>
      <Heart aria-hidden="true" />
      {liked && likeCount > 0 && <span className="story-heart-count">{likeCount}</span>}
    </button>
    <button type="submit" className="story-send" disabled={sending || !reply.trim()} aria-label="Send reply">
      <Send aria-hidden="true" />
    </button>
  </form>;
}
