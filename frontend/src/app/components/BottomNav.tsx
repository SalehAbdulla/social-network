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
const TABS = [
  { href: '/', label: 'Feed', icon: House },
  { href: '/search', label: 'Search', icon: SearchIcon },
  { href: '/create-post', label: 'Create', icon: CirclePlus },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Profile', icon: UserRound },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { badges } = useBackend();
  return <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-card/90 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
    {TABS.map(({ href, label, icon: Icon }) => {
      const current = pathname === href || (href !== '/' && pathname.startsWith(href + '/'));
      return <Link key={href} href={href} aria-current={current ? 'page' : undefined} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${current ? 'text-brand-1' : 'text-muted'}`}>
        <span className="relative"><Icon size={22} />{href === '/notifications' && !!badges?.notifications && <span aria-hidden="true" className="absolute -right-1 -top-0.5 size-2 rounded-full bg-red-600" />}</span>
        <span>{label}</span>
      </Link>;
    })}
  </nav>;
}
