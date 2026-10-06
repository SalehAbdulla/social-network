'use client';

import Link from 'next/link';
import { displayName } from '../api/social';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import { ACCOUNT_AVATAR_SIZE } from '../lib/sizing';

/**
 * The signed-in member, at the top of the feed's right-hand rail — Instagram's account row above
 * the "Suggested for you" list. The whole row is a link to the profile: this app has no second
 * account to hand the session to, so where Instagram offers a "Switch" the only thing to do here
 * is go to your own page.
 *
 * It belongs to the rail, not the shell: it is only mounted where the rail is (`xl` up), because
 * below that the sidebar already carries the same avatar, name and handle and a second copy on
 * screen would be the duplication the navigation rule exists to avoid.
 */
export default function AccountRailCard() {
  const { user } = useBackend();
  return <section aria-label="Your account">
    <Link href="/profile" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-2">
      <Avatar name={displayName(user)} avatarUrl={user.avatar} size={ACCOUNT_AVATAR_SIZE} />
      <span className="min-w-0">
        <span className="block truncate text-[length:var(--aside-name-size)] font-semibold text-text">{displayName(user)}</span>
        <span className="block truncate text-[length:var(--aside-handle-size)] text-muted">@{user.nickname}</span>
      </span>
    </Link>
  </section>;
}
