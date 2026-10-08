'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, Maximize2, X } from 'lucide-react';
import Avatar from '../Avatar';
import IconButton from '../ui/IconButton';

export default function DockHeader({ name, handle, avatar, online, profileHref, onBack, onExpand, onClose, sub, action }: {
  name: string;
  handle: string;
  avatar: string;
  online: boolean;
  profileHref: string;
  onBack: () => void;
  onExpand: () => void;
  onClose: () => void;
  sub?: string;
  action?: ReactNode;
}) {
  const subtitle = sub ?? (online ? 'Active now' : handle || 'Offline');
  return <header className="dock-header">
    <IconButton label="Back to messages" className="dock-icon" onClick={onBack}><ChevronLeft aria-hidden="true" /></IconButton>
    <Link href={profileHref} className="flex min-w-0 flex-1 items-center gap-2">
      <span className="dock-header-avatar">
        <Avatar name={name} avatarUrl={avatar} size={32} />
        {online && <span className="dm-presence" aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="dock-header-name truncate">{name}</span>
        <span className="dock-header-sub truncate">{subtitle}</span>
      </span>
    </Link>
    {action}
    <IconButton label="Expand to full view" className="dock-icon" onClick={onExpand}><Maximize2 aria-hidden="true" /></IconButton>
    <IconButton label="Close messages" className="dock-icon" onClick={onClose}><X aria-hidden="true" /></IconButton>
  </header>;
}
