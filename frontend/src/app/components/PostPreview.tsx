'use client';

import { linkify } from '../lib/linkify';
import { mediaImageProps } from '../lib/mediaVariants';
import { type Post, type SocialUser, PRIVACY_LABEL, dateLabel, isoTimestamp, relativeLabel } from '../api/social';
import Avatar from './Avatar';

interface PostPreviewProps {
  user: SocialUser;
  title: string;
  content: string;
  privacy: Post['privacy'];
  /** Display URLs: the post's own media when editing, plus blob URLs for files just picked. */
  imageUrls: string[];
  /** The post's creation time when editing; a brand-new draft shows "Just now". */
  createdAt?: string;
}

/**
 * The draft rendered the way `PostCard` will show it, so the author sees the post
 * the chosen audience will. It is deliberately not interactive: a draft has no
 * `postId`, so there are no links, vote arrows or edit/delete buttons to hang off it.
 */
export default function PostPreview({ user, title, content, privacy, imageUrls, createdAt }: PostPreviewProps) {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  return (
    <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={user.nickname} avatarUrl={user.avatar} />
        <div>
          <p className="font-semibold">@{user.nickname}</p>
          <p className="text-xs text-muted">
            {createdAt
              ? <time dateTime={isoTimestamp(createdAt)} title={dateLabel(createdAt)}>{relativeLabel(createdAt)}</time>
              : <time>Just now</time>}
          </p>
        </div>
      </div>
      {trimmedTitle && <p className="text-lg font-semibold">{trimmedTitle}</p>}
      <p className="whitespace-pre-wrap break-words text-text">
        {trimmedContent ? linkify(trimmedContent) : <span className="text-muted">Your post will appear here…</span>}
      </p>
      <span className="inline-block rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">{PRIVACY_LABEL[privacy]}</span>
      {imageUrls.length > 0 && (
        <div className={`grid gap-2 ${imageUrls.length > 1 ? 'grid-cols-2' : ''}`}>
          {imageUrls.map((url, position) => (
            <img
              key={url}
              {...mediaImageProps(url, imageUrls.length > 1 ? '(max-width: 640px) 50vw, 320px' : '(max-width: 768px) 100vw, 640px')}
              alt={`Attachment ${position + 1}`}
              className="aspect-square max-h-[540px] w-full rounded-xl bg-card-2 object-contain"
            />
          ))}
        </div>
      )}
    </article>
  );
}
