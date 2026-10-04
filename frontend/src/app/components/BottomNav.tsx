'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CirclePlus, House, Search as SearchIcon, UserRound } from 'lucide-react';
import { useBackend } from './BackendProvider';

/**
 * The phone's navigation: Instagram's bottom tab bar, in place of the off-canvas drawer the
 * sidebar used to become. It is `lg:hidden`, so from `lg:` up the sidebar is the only
 * navigation and below it this is the only one — the two never show at the same time.
 *
 * Every tab is a real link, so it can be opened in a new tab and is announced as a link, and
 * the current one carries `aria-current`. Only the notifications tab has a badge, and only a
 * dot: the numeric count stays the sidebar's and the top bar's, so a phone never has two
 * elements claiming to be the same unread total. The safe-area padding keeps the bar clear of
 * a home indicator.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { badges, openComposer } = useBackend();
  const current = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
  const tab = (active: boolean) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${active ? 'text-brand-1' : 'text-muted'}`;
  return <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-card/90 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <Link href="/" aria-current={current('/') ? 'page' : undefined} className={tab(current('/'))}><House size={22} /><span>Feed</span></Link>
    <Link href="/search" aria-current={current('/search') ? 'page' : undefined} className={tab(current('/search'))}><SearchIcon size={22} /><span>Search</span></Link>
    <button type="button" onClick={openComposer} className={tab(false)}><CirclePlus size={22} /><span>Create</span></button>
    <Link href="/notifications" aria-current={current('/notifications') ? 'page' : undefined} className={tab(current('/notifications'))}><span className="relative"><Bell size={22} />{!!badges?.notifications && <span aria-hidden="true" className="absolute -right-1 -top-0.5 size-2 rounded-full bg-red-600" />}</span><span>Notifications</span></Link>
    <Link href="/profile" aria-current={current('/profile') ? 'page' : undefined} className={tab(current('/profile'))}><UserRound size={22} /><span>Profile</span></Link>
  </nav>;
}
