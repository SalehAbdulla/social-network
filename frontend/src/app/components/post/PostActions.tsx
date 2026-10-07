'use client';

import { Bookmark, Heart, MessageCircle, Share2 } from 'lucide-react';

/**
 * The post view's action bar: like, comment, share and save, with the like and comment counts.
 * The icons are one size and one stroke from the `--pv-*` tokens, so this bar and the feed card's
 * cannot drift apart.
 */
export default function PostActions({ liked, saved, showSave = true, busy = false, onLike, onComment, onShare, onSave }: {
  liked: boolean;
  saved: boolean;
  /** A group post is not in the saved list, so the bookmark is not drawn for it. */
  showSave?: boolean;
  busy?: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onSave: () => void;
}) {
  return <div className="pv-actions">
    <button type="button" className="pv-action" aria-label={liked ? 'Unlike post' : 'Like post'} aria-pressed={liked} data-liked={liked} disabled={busy} onClick={onLike}><Heart fill={liked ? 'currentColor' : 'none'} aria-hidden="true" /></button>
    <button type="button" className="pv-action" aria-label="Comment" onClick={onComment}><MessageCircle aria-hidden="true" /></button>
    <button type="button" className="pv-action" aria-label="Share post" onClick={onShare}><Share2 aria-hidden="true" /></button>
    {showSave && <button type="button" className="pv-action pv-end" aria-label={saved ? 'Remove from saved' : 'Save post'} aria-pressed={saved} onClick={onSave}><Bookmark fill={saved ? 'currentColor' : 'none'} aria-hidden="true" /></button>}
  </div>;
}
