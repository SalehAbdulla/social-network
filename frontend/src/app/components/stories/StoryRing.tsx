'use client';

import Avatar from '../Avatar';

/**
 * The one story ring, shared by the tray and the viewer's neighbour previews so "new" reads the
 * same in both places.
 *
 * An unseen author wears a three-pixel gradient ring in electric blue with a soft, gently pulsing
 * glow; a seen author wears a thin muted ring with no glow. The two are separate layers that
 * cross-fade over ~300ms, so the glow fades out — rather than jumping — the moment a reader
 * finishes an author's last story. The component owns no state and never ticks: the pulse is a
 * CSS animation, and the only input that changes it is the `seen` prop.
 */
export default function StoryRing({ name, avatarUrl, size = 56, seen, own = false, marker = true, className = '' }: {
  name: string;
  avatarUrl?: string | null;
  /** Outer diameter, in pixels. */
  size?: number;
  /** Seen ⇒ muted ring, no glow; unseen ⇒ gradient ring with the pulsing glow. */
  seen: boolean;
  /** The viewer's own tile, which never glows. */
  own?: boolean;
  /** Also emit `data-story-ring`, the hook the browser suite reads. Off for the own tile. */
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
