'use client';

import Link from 'next/link';

/**
 * The chat rule from the spec, in one place: a private message needs at least one
 * follow in either direction, or a public profile on the recipient's side. The
 * backend already enforces it and reports the answer as the viewer-relative
 * `canMessage` flag on `GET /api/v1/users/{userId}` and `GET /api/v1/users`, so
 * the UI can explain the rule before the click instead of handing back the 403
 * that a blocked attempt would earn.
 */
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
