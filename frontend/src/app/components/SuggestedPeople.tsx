'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type SocialUser, displayName, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';

/** How many people the rail offers; past this it stops being a rail. */
const SUGGESTIONS = 3;

/**
 * A few members the viewer does not follow yet, offered on the feed.
 *
 * It reads `GET /api/v1/users` — the same list Discover shows — and does the thing that
 * endpoint cannot do for itself: drop everyone the viewer already follows or has already
 * asked to follow. What it deliberately is not is a suggestion engine: the list arrives
 * ordered by handle, and a friends-of-friends ranking would need a query of its own. That
 * difference is written down in `TODO.md` rather than left for the title to imply.
 *
 * The rail renders nothing at all when it has nothing to offer, loading included: a
 * heading with no people under it is worse than no heading, and it is what the feed would
 * otherwise show on the first paint of every visit.
 */
export default function SuggestedPeople() {
  const { user, refreshUser } = useBackend();
  const people = useResource<SocialUser[]>('/users');
  const [busy, setBusy] = useState('');
  // The members this rail has just acted on. `user.following` cannot answer for a
  // *request* — a private profile is not followed until it is accepted — so the rail
  // remembers who it has handled, and a reload is what clears it.
  const [handled, setHandled] = useState<string[]>([]);

  const suggestions = (people.data || [])
    .filter(person => person.userId !== user.userId
      && !user.following.includes(person.userId)
      && !person.pendingOutgoing
      && !handled.includes(person.userId))
    .slice(0, SUGGESTIONS);

  async function follow(person: SocialUser) {
    if (busy) return;
    setBusy(person.userId);
    try {
      await request(`/users/${person.userId}/follow`, 'PUT');
      // Following a public profile is immediate, so the refreshed user is what would
      // remove them; a private one is only requested, which is why the rail also keeps
      // its own list — and why both are done rather than one.
      setHandled(current => [...current, person.userId]);
      await refreshUser();
      toast.success(person.isPublic ? `Following @${person.nickname}` : `Requested to follow @${person.nickname}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally { setBusy(''); }
  }

  if (suggestions.length === 0) return null;
  return <section aria-label="People you may know" className="rounded-2xl border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">People you may know</h2>
      <Link href="/discover" className="text-xs font-medium text-brand-1 hover:underline">See all</Link>
    </div>
    <ul className="mt-3 grid gap-2 sm:grid-cols-3">{suggestions.map(person => <li key={person.userId} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-2">
      <Link href={`/profile/${person.userId}`} className="flex min-w-0 flex-1 items-center gap-2">
        <Avatar name={displayName(person)} avatarUrl={person.avatar} size={36} />
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{displayName(person)}</span><span className="block truncate text-xs text-slate-500">@{person.nickname}</span></span>
      </Link>
      <button type="button" disabled={busy === person.userId} onClick={() => void follow(person)} className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-50">{person.isPublic ? 'Follow' : 'Request'}</button>
    </li>)}</ul>
  </section>;
}
