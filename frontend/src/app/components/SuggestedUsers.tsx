'use client';

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type UserSuggestion, displayName, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import { SUGGEST_AVATAR_SIZE } from '../lib/sizing';

const LIMIT = 5;

export function reasonFor(person: UserSuggestion): string {
  if (!person.mutuals?.length) return 'Suggested for you';
  const more = person.mutualCount - 1;
  return more > 0 ? `Followed by ${person.mutuals[0]} + ${more} more` : `Followed by ${person.mutuals[0]}`;
}

function RowSkeleton() {
  return <div aria-hidden="true" className="flex h-[var(--rc-row-height)] items-center gap-3">
    <span className="block shrink-0 animate-pulse rounded-full bg-rail-hover-strong" style={{ width: 'var(--rc-avatar)', height: 'var(--rc-avatar)' }} />
    <span className="min-w-0 flex-1 space-y-2">
      <span className="block h-3.5 w-28 animate-pulse rounded bg-rail-hover-strong" />
      <span className="block h-2.5 w-20 animate-pulse rounded bg-rail-hover-strong" />
    </span>
  </div>;
}

export default function SuggestedUsers() {
  const { refreshUser } = useBackend();
  const { data, error, loading } = useResource<UserSuggestion[]>(`/users/suggestions?limit=${LIMIT}`);
  const [acted, setActed] = useState<Record<string, 'following' | 'requested'>>({});
  const [busy, setBusy] = useState('');

  async function follow(person: UserSuggestion) {
    if (busy) return;
    setBusy(person.userId);
    setActed(state => ({ ...state, [person.userId]: person.isPublic ? 'following' : 'requested' }));
    try {
      await request(`/users/${person.userId}/follow`, 'PUT');
      await refreshUser();
    } catch (error) {
      setActed(state => { const next = { ...state }; delete next[person.userId]; return next; });
      toast.error(errorMessage(error));
    } finally { setBusy(''); }
  }

  if (error) {
    console.warn('Suggested for you failed to load:', error);
    return null;
  }

  if (loading) return <section aria-label="Suggested for you" className="mt-[var(--rc-header-top)]">
    <div className="mb-[var(--rc-header-bottom)] flex items-center justify-between gap-3">
      <h2 className="text-[length:var(--rc-name-size)] font-semibold text-muted">Suggested for you</h2>
    </div>
    {Array.from({ length: LIMIT }, (_, index) => <RowSkeleton key={index} />)}
  </section>;

  const people = (data ?? []).slice(0, LIMIT);
  if (people.length === 0) return null;

  return <section aria-label="Suggested for you" className="mt-[var(--rc-header-top)]">
    <div className="mb-[var(--rc-header-bottom)] flex items-center justify-between gap-3">
      <h2 className="text-[length:var(--rc-name-size)] font-semibold text-muted">Suggested for you</h2>
      <Link href="/discover" className="text-[length:var(--rc-follow-size)] font-semibold text-text hover:opacity-70">See all</Link>
    </div>
    <ul>{people.map(person => {
      const state = acted[person.userId];
      return <li key={person.userId} className="flex h-[var(--rc-row-height)] items-center gap-3">
        <Link href={`/profile/${person.userId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={displayName(person)} avatarUrl={person.avatar} size={SUGGEST_AVATAR_SIZE} />
          <span className="min-w-0">
            <span dir="auto" className="block truncate text-[length:var(--rc-name-size)] font-semibold text-text">{displayName(person)}</span>
            <span dir="auto" className="block truncate text-[length:var(--rc-meta-size)] text-muted">{reasonFor(person)}</span>
          </span>
        </Link>
        {state
          ? <span className="shrink-0 text-[length:var(--rc-follow-size)] font-semibold text-muted">{state === 'requested' ? 'Requested' : 'Following'}</span>
          : <button type="button" disabled={busy === person.userId} onClick={() => void follow(person)} className="shrink-0 text-[length:var(--rc-follow-size)] font-semibold text-[color:var(--rc-link)] hover:opacity-70 disabled:opacity-50">Follow</button>}
      </li>;
    })}</ul>
  </section>;
}
