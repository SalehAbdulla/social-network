'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface ConversationItem {
  key: string;
  href: string;
  name: string;
  avatar: ReactNode;
  online?: boolean;
  preview: string;
  stamp: string;
  unread?: boolean;
  onSelect?: () => void;
}

export default function ConversationRow({ item, active }: { item: ConversationItem; active: boolean }) {
  const secondary = [item.preview, item.stamp].filter(Boolean).join(' · ');
  const className = `dm-row${item.unread ? ' dm-row-unread' : ''}`;
  const body = <>
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
  </>;
  if (item.onSelect) return <button
    type="button"
    title={item.name}
    aria-current={active ? 'page' : undefined}
    className={className}
    onClick={item.onSelect}
  >{body}</button>;
  return <Link
    href={item.href}
    title={item.name}
    aria-current={active ? 'page' : undefined}
    className={className}
  >{body}</Link>;
}
