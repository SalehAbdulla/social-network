'use client';

import Link from 'next/link';

export const messageBlockedReason = 'You can message someone once one of you follows the other, or when their profile is public.';

export default function MessageAction({ userId, allowed, className }: { userId: string; allowed: boolean; className?: string }) {
  if (allowed) return <Link href={`/messages/${userId}`} className={className}>Message</Link>;
  return (
    <span
      aria-disabled="true"
      title={messageBlockedReason}
      className={`inline-flex cursor-not-allowed items-center opacity-60 ${className ?? ''}`}
    >
      Message
      <span className="sr-only"> ({messageBlockedReason})</span>
    </span>
  );
}
