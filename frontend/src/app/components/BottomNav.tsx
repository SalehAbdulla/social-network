'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Compass, House, Search as SearchIcon, SquarePlus, UserRound } from 'lucide-react';
import { useBackend } from './BackendProvider';
import { useCreatePost } from '../lib/useCreatePost';

/**
 * The phone's navigation, which is where the rail goes below `md`: a fixed icon-only tab bar with
 * a 1px top border, the shape Instagram uses. Notifications lives here (the rail carries it in a
 * panel); Messages stays in the top strip, so no destination is offered twice. Every tab is a real
 * link or button and carries an `aria-label`, since the labels are gone.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { badges } = useBackend();
  const create = useCreatePost();
  const current = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  const tab = (active: boolean) => `flex flex-1 items-center justify-center transition-colors ${active ? 'text-text' : 'text-muted'}`;
  return <>
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-rail-border bg-rail font-sans md:hidden" style={{ minHeight: 50, paddingBottom: 'env(safe-area-inset-bottom)' }}>
    <Link href="/" aria-label="Feed" aria-current={current('/') ? 'page' : undefined} className={tab(current('/'))}><House size={24} strokeWidth={current('/') ? 2.75 : 2} aria-hidden="true" /></Link>
    <Link href="/search" aria-label="Search" aria-current={current('/search') ? 'page' : undefined} className={tab(current('/search'))}><SearchIcon size={24} strokeWidth={current('/search') ? 2.75 : 2} aria-hidden="true" /></Link>
    <Link href="/discover" aria-label="Discover" aria-current={current('/discover') ? 'page' : undefined} className={tab(current('/discover'))}><Compass size={24} strokeWidth={current('/discover') ? 2.75 : 2} aria-hidden="true" /></Link>
    <button type="button" aria-label="Create post" aria-expanded={create.isOpen} onClick={create.open} className={tab(false)}><SquarePlus size={24} aria-hidden="true" /></button>
    <Link href="/notifications" aria-label="Notifications" aria-current={current('/notifications') ? 'page' : undefined} className={tab(current('/notifications'))}>
      <span className="relative">
        <Bell size={24} strokeWidth={current('/notifications') ? 2.75 : 2} aria-hidden="true" />
        {!!badges?.notifications && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1 text-[10px] font-semibold leading-none text-white">{badges.notifications > 99 ? '99+' : badges.notifications}</span>}
      </span>
    </Link>
    <Link href="/profile" aria-label="Profile" aria-current={current('/profile') ? 'page' : undefined} className={tab(current('/profile'))}><UserRound size={24} strokeWidth={current('/profile') ? 2.75 : 2} aria-hidden="true" /></Link>
    </nav>
    {create.modal}
  </>;
}
