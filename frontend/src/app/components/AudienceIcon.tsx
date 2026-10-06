'use client';

import { Globe, Lock, Users, type LucideIcon, type LucideProps } from 'lucide-react';
import { PRIVACY_LABEL, type Post } from '../api/social';

/**
 * The three privacy levels as an icon, for the secondary line of a post's header.
 *
 * `followers` and `selected` are the app's own two narrower levels — there is no `private`
 * column — so the lock marks `selected`, the one the composer words as "Selected followers".
 * The wording comes from `PRIVACY_LABEL`, the same map the composer's select renders, so the
 * icon's name and that option can never disagree.
 */
const AUDIENCE_ICON: Record<Post['privacy'], LucideIcon> = {
  public: Globe,
  followers: Users,
  selected: Lock,
};

/**
 * A post's audience, as an icon: no pill, no background, no border, only the muted mark itself.
 *
 * `context` names the surface when the post is not a feed post: a group post is visible to the
 * whole group, so it carries the `Users` mark titled "Group" rather than the privacy globe, and
 * the two share one implementation so the size and the alignment cannot drift apart.
 *
 * The size is the `--post-audience-icon` token rather than a `size` prop, so the one number lives
 * with the rest of the interface measurements. `inline-block` is needed because Tailwind's
 * preflight makes every `svg` a block, which would drop this onto a line of its own inside the
 * `<p>` that holds the handle and the time; `align-middle` sits it level with that text.
 *
 * The audience is stated twice on purpose, and both are read: `title` is the attribute a pointer
 * rests on, and the `<title>` child is what an inline SVG is supposed to carry and what the
 * browser shows if it reads the attribute and the child differently. They hold the same word, so
 * only one tooltip can ever appear. `aria-label` is the name a screen reader announces, and it
 * comes from `PRIVACY_LABEL`. This is why the post no longer needs the grey chip it used to
 * carry under its description. React's SVG attribute type has no `title` of its own — an SVG
 * titles itself with the child element — so the attribute is spread in from a widened object
 * rather than written inline.
 */
export default function AudienceIcon({ privacy, context }: { privacy: Post['privacy']; context?: 'feed' | 'group' }) {
  const label = context === 'group' ? 'Group' : PRIVACY_LABEL[privacy];
  const Icon = context === 'group' ? Users : AUDIENCE_ICON[privacy];
  const titleAttribute: LucideProps & { title: string } = { title: label };
  return <Icon role="img" aria-label={label} {...titleAttribute} className="inline-block size-[var(--post-audience-icon)] shrink-0 align-middle text-muted"><title>{label}</title></Icon>;
}

