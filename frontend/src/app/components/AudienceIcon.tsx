'use client';

import { Globe, Lock, Users, type LucideIcon, type LucideProps } from 'lucide-react';
import { PRIVACY_LABEL, type Post } from '../api/social';

const AUDIENCE_ICON: Record<Post['privacy'], LucideIcon> = {
  public: Globe,
  followers: Users,
  selected: Lock,
};

export default function AudienceIcon({ privacy, context }: { privacy: Post['privacy']; context?: 'feed' | 'group' }) {
  const label = context === 'group' ? 'Group' : PRIVACY_LABEL[privacy];
  const Icon = context === 'group' ? Users : AUDIENCE_ICON[privacy];
  const titleAttribute: LucideProps & { title: string } = { title: label };
  return <Icon role="img" aria-label={label} {...titleAttribute} className="inline-block size-[var(--post-audience-icon)] shrink-0 align-middle text-muted"><title>{label}</title></Icon>;
}

