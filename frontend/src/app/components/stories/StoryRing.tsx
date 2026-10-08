'use client';

import Avatar from '../Avatar';

export default function StoryRing({ name, avatarUrl, size = 56, seen, own = false, marker = true, className = '' }: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  seen: boolean;
  own?: boolean;
  marker?: boolean;
  className?: string;
}) {
  const face = Math.max(24, size - 10);
  return <span
    className={`story-ring ${className}`}
    data-state={seen ? 'seen' : 'unseen'}
    data-own={own ? 'true' : undefined}
    {...(marker ? { 'data-story-ring': seen ? 'seen' : 'unseen' } : {})}
    style={{ width: size, height: size }}
  >
    <span className="story-ring-unseen" aria-hidden="true" />
    <span className="story-ring-seen" aria-hidden="true" />
    <span className="story-ring-cowl" aria-hidden="true" />
    <span className="story-ring-face" aria-hidden="true"><Avatar name={name} avatarUrl={avatarUrl} size={face} /></span>
    <span className="sr-only">{seen ? `${name}, story viewed` : `${name}, new story`}</span>
  </span>;
}
