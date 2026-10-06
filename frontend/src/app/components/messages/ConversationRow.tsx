'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * One row of the conversation list.
 *
 * The caller resolves a person or a group into this shape — it owns the avatar, so the
 * row stays dumb about whether the conversation is one-to-one or a group — and the row
 * draws the two lines, the unread weight and dot, and the presence ring. The whole row
 * is a real `<a>`, which is what makes the middle-click and the keyboard behave.
 */
export interface ConversationItem {
  key: string;
  href: string;
  name: string;
  avatar: ReactNode;
  /** A group's avatar is drawn by the caller; this puts the online ring on a person's. */
  online?: boolean;
  preview: string;
  stamp: string;
  unread?: boolean;
}

export default function ConversationRow({ item, active }: { item: ConversationItem; active: boolean }) {
  const secondary = [item.preview, item.stamp].filter(Boolean).join(' · ');
  return <Link
    href={item.href}
    // Shown as a native tooltip, which is how the collapsed (avatar-only) list keeps a
    // name reachable once the two lines are hidden.
    title={item.name}
    aria-current={active ? 'page' : undefined}
    className={`dm-row${item.unread ? ' dm-row-unread' : ''}`}
  >
    <span className="dm-row-avatar">
      {item.avatar}
      {!!item.online && <span className="dm-presence" aria-hidden="true" />}
    </span>
    <span className="dm-row-body">
      <span className="dm-row-name">{item.name}</span>
      {secondary && <span className="dm-row-preview">{secondary}</span>}
    </span>
    {!!item.unread && <>
      <span className="dm-row-dot" aria-hidden="true" />
      <span className="sr-only">Unread</span>
    </>}
  </Link>;
}
