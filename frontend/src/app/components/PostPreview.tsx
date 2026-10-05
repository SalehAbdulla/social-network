'use client';

import { Eye } from 'lucide-react';
import { linkify } from '../lib/linkify';
import { mediaImageProps } from '../lib/mediaVariants';
import { type Post, type SocialUser, PRIVACY_LABEL, audienceSummary, dateLabel, displayName, isoTimestamp, relativeLabel } from '../api/social';
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
  /** Display names of the followers a `selected` draft is going to, in list order. */
  selectedNames?: string[];
}

/**
 * The draft rendered the way `PostCard` will show it, so the author sees the post
 * the chosen audience will, under a banner that names that audience in words. The
 * card part is deliberately not interactive: a draft has no `postId`, so there are
 * no links, vote arrows or edit/delete buttons to hang off it.
 */
export default function PostPreview({ user, title, content, privacy, imageUrls, createdAt, selectedNames = [] }: PostPreviewProps) {
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();
  // Who the post will actually reach. It sits above the card rather than inside it,
  // because the article below is meant to be the draft exactly as `PostCard` draws it
  // and the card carries no such banner. `role="status"` announces it when the
  // audience changes, and `aria-label` is what the browser checks read it by.
  const audience = audienceSummary({ privacy, authorIsPublic: user.isPublic, selectedNames });
  return (
    <>
    <div role="status" aria-label="Audience" data-audience={privacy} className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
      <Eye size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-1" />
      <span className="min-w-0">
        <span className="font-medium text-text">{audience.headline}</span>
        {audience.note && <span className="mt-0.5 block text-xs text-muted">{audience.note}</span>}
      </span>
    </div>
    <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={displayName(user)} avatarUrl={user.avatar} />
        <div>
          <p className="font-semibold">{displayName(user)}</p>
          <p className="text-xs text-muted">
            @{user.nickname}<span aria-hidden="true"> · </span>
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
    </>
  );
}
