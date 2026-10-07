'use client';

import { Heart, Layers, MessageCircle, Play } from 'lucide-react';
import { type Post, displayName } from '../../api/social';
import { mediaImageProps } from '../../lib/mediaVariants';

/** Attachments carry no type, so the file name decides whether a tile shows a clip or a photo. */
export function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/**
 * One tile of the profile grid. It is an anchor to the post's own page — so a middle-click or a
 * copied address still works — but a plain click is intercepted to open the overlay instead, and
 * the modifier keys are left alone so "open in a new tab" keeps working. The tile is a 3:4 crop of
 * the first attachment; a text-only post draws its copy instead; a clip and a multi-photo post
 * carry their badge; and the like and comment counts appear over a 30% scrim on hover or focus.
 */
export default function PostTile({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const media = post.imageUrls[0];
  const video = !!media && isVideo(media);
  const multiple = !video && post.imageUrls.length > 1;
  const name = displayName(post);
  return <a
    href={`/post/${post.postId}`}
    className="profile-tile"
    onClick={event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onOpen();
    }}
  >
    {media
      ? (video
        ? <video src={media} muted preload="metadata" />
        : <img {...mediaImageProps(media, '(max-width: 640px) 33vw, 320px')} alt={`Post by ${name}`} />)
      : <span className="profile-tile-copy"><p dir="auto" aria-label={`Post by ${name}`}>{post.content}</p></span>}
    {video && <span className="profile-tile-badge" aria-hidden="true"><Play /></span>}
    {multiple && <span className="profile-tile-badge" aria-hidden="true"><Layers /></span>}
    <span className="profile-tile-scrim" aria-hidden="true">
      <span><Heart fill="currentColor" />{post.score}</span>
      <span><MessageCircle fill="currentColor" />{post.commentsCounter}</span>
    </span>
  </a>;
}
