'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, MessageSquare, Search as SearchIcon } from 'lucide-react';
import { displayName } from '../api/social';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';

/**
 * The Instagram-style top bar: a slim, sticky strip with the wordmark, a search field
 * and the account controls, so search, notifications and the profile are one tap away
 * instead of behind the navigation drawer.
 *
 * It reads the two badges from `BackendProvider` rather than fetching them itself, which is
 * what keeps the pair to a single `/notifications/unread-counts` request even though several
 * surfaces now show parts of it. Below `sm` the wordmark shrinks to the favicon and the search
 * field moves to the bottom tab bar (`BottomNav`), so the bar stays uncrowded on a phone while
 * search is still one tap away.
 */
export default function TopBar() {
  const { user, badges } = useBackend();
  const router = useRouter();
  const [term, setTerm] = useState('');

  // The search page owns the query string, so the bar only has to hand it a term.
  function search(event: React.FormEvent) {
    event.preventDefault();
    const next = term.trim();
    if (!next) return;
    router.push(`/search?q=${encodeURIComponent(next)}`);
    setTerm('');
  }

  return <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/80 px-3 backdrop-blur-xl sm:px-4">
    <Link href="/" className="flex shrink-0 items-center"><img src="/favicon.svg" alt="Social Network" className="h-8 w-8 object-contain sm:hidden" /><img src="/logo.svg" alt="Social Network" className="hidden h-8 w-auto object-contain dark:brightness-125 sm:block" /></Link>
    <form onSubmit={search} role="search" className="mx-auto hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 sm:flex">
      <SearchIcon size={16} className="shrink-0 text-muted" aria-hidden="true" />
      <label htmlFor="topbar-search" className="sr-only">Search</label>
      <input id="topbar-search" name="q" value={term} onChange={event => setTerm(event.target.value)} placeholder="Search" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted" />
    </form>
    <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Link href="/notifications" aria-label="Notifications" title="Notifications" className="relative flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2"><Bell size={20} />{!!badges?.notifications && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-600" />}</Link>
      <Link href="/messages" aria-label="Messages" title="Messages" className="relative flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2"><MessageSquare size={20} />{!!badges?.messages && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-teal-700" />}</Link>
      <span className="hidden sm:inline"><ThemeToggle /></span>
      <Link href="/profile" aria-label="Your profile" title={displayName(user)} className="ml-1 shrink-0"><Avatar name={displayName(user)} avatarUrl={user.avatar} size={32} /></Link>
    </div>
  </header>;
}
