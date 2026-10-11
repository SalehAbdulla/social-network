'use client';

import { Globe, Lock, Users, type LucideIcon, type LucideProps } from 'lucide-react';
import { audienceLabel, type Post } from '../api/social';

const AUDIENCE_ICON: Record<Post['privacy'], LucideIcon> = {
  public: Globe,
  followers: Users,
  selected: Lock,
};

export default function AudienceIcon({ privacy, context, authorIsPublic }: { privacy: Post['privacy']; context?: 'feed' | 'group'; authorIsPublic?: boolean }) {
  // A public post on a private profile never reaches the public feed, so the globe
  // is replaced by the audience that actually applies.
  const label = context === 'group' ? 'Group' : audienceLabel({ privacy, authorIsPublic });
  const Icon = context === 'group' ? Users : AUDIENCE_ICON[privacy];
  const titleAttribute: LucideProps & { title: string } = { title: label };
  return <Icon role="img" aria-label={label} {...titleAttribute} className="inline-block size-[var(--post-audience-icon)] shrink-0 align-middle text-muted"><title>{label}</title></Icon>;
}

