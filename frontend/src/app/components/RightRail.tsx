'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request } from '../api/social';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import SuggestedUsers from './SuggestedUsers';
import { SUGGEST_AVATAR_SIZE } from '../lib/sizing';

const FOOTER_LINKS: { label: string; href: string }[] = [];

export default function RightRail() {
  const { user, accounts } = useBackend();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await request('/auth/logout', 'POST');
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch (error) {
      toast.error(errorMessage(error));
      setLoggingOut(false);
    }
  }

  return <div>
    <section aria-label="Your account" className="flex items-center gap-3">
      <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={displayName(user)} avatarUrl={user.avatar} size={SUGGEST_AVATAR_SIZE} />
        <span className="min-w-0">
          <span dir="auto" className="block truncate text-[length:var(--rc-name-size)] font-semibold text-text">{user.nickname}</span>
          <span dir="auto" className="block truncate text-[length:var(--rc-sub-size)] text-muted">{displayName(user)}</span>
        </span>
      </Link>
      {accounts.length > 1
        ? <button type="button" onClick={() => window.dispatchEvent(new Event('social:switch-accounts'))} className="shrink-0 text-[length:var(--rc-follow-size)] font-semibold text-[color:var(--rc-link)] hover:opacity-70">Switch</button>
        : <button type="button" disabled={loggingOut} onClick={() => void logout()} className="shrink-0 text-[length:var(--rc-follow-size)] font-semibold text-[color:var(--rc-link)] hover:opacity-70 disabled:opacity-50">{loggingOut ? 'Logging out…' : 'Log out'}</button>}
    </section>
    <SuggestedUsers />
    <footer className="rc-footer">
      {FOOTER_LINKS.length > 0 && <nav aria-label="Footer" className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
        {FOOTER_LINKS.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
      </nav>}
      <p>© 2026 Social Network</p>
    </footer>
  </div>;
}
