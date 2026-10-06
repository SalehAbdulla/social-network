'use client';

import Link from 'next/link';
import { ChevronLeft, Info } from 'lucide-react';
import Avatar from '../Avatar';

/**
 * The chat's pinned header.
 *
 * The avatar carries the presence dot and links to the profile, the name sits over a
 * one-line status, and the only control is the Info toggle: the app has no calls, so
 * there are no dead phone or video buttons beside it. The 68px height and the icon size
 * are tokens, so the header lines up with the conversation rows at the same scale.
 *
 * `data-connected` is on the element rather than drawn as a dot: the app shell already
 * shows a reconnecting banner, so the chat only needs to expose the socket state, not
 * repeat it as chrome.
 */
export default function ChatHeader({ name, handle, avatar, online, typing, profileHref, connected, detailsOpen, onToggleDetails, sub }: {
  name: string;
  handle: string;
  avatar: string;
  online: boolean;
  typing: boolean;
  profileHref: string;
  connected: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  /** Overrides the derived status line (groups pass a member count instead). */
  sub?: string;
}) {
  const subtitle = sub ?? (typing ? 'Typing…' : online ? 'Active now' : handle || 'Offline');
  return <header className="dm-header" data-connected={connected ? 'true' : 'false'}>
    <Link href="/messages" aria-label="Back to conversations" className="dm-icon dm-back">
      <ChevronLeft aria-hidden="true" />
    </Link>
    <Link href={profileHref} className="flex min-w-0 items-center gap-3">
      <span className="dm-header-avatar">
        <Avatar name={name} avatarUrl={avatar} size={44} />
        {online && <span className="dm-presence" aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="dm-header-name truncate">{name}</span>
        <span className="dm-header-sub truncate">{subtitle}</span>
      </span>
    </Link>
    <button
      type="button"
      aria-label="Conversation details"
      aria-expanded={detailsOpen}
      onClick={onToggleDetails}
      className="dm-icon ml-auto"
    >
      <Info aria-hidden="true" />
    </button>
  </header>;
}
