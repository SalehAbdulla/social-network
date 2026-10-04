'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Bookmark, CirclePlus, Compass, House, MessageSquare, Search, UserRound, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request } from '../api/social';
import { useBackend } from './BackendProvider';
import { useState } from 'react';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';

export default function Sidebar({ isCollapsed, setIsCollapsed }: {
  isCollapsed: boolean; setIsCollapsed: (collapsed: boolean) => void;
}) {
  const { user, badges } = useBackend();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  // The bell and the Messages entry report different things: the spec wants new
  // notifications and new private messages displayed differently, so the bell is
  // everything except messages and the Messages entry is only those. Both come from the
  // one `/notifications/unread-counts` fetch `BackendProvider` owns — the top bar reads
  // the same numbers — so a single request answers both bars and both badges.
  const links = [
    { href: '/', label: 'Feed', icon: House }, { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/discover', label: 'Discover', icon: Compass }, { href: '/saved', label: 'Saved', icon: Bookmark },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/notifications', label: 'Notifications', icon: Bell }, { href: '/profile', label: 'Profile', icon: UserRound },
  ];
  async function logout() {
    setLoggingOut(true);
    try {
      await request('/auth/logout', 'POST');
      // A full reload is deliberate: it drops the WebSocket and every other piece
      // of client state the signed-out session owned, which a router push would
      // leave behind. The app sets no `basePath`, so the relative path is correct.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch (error) {
      toast.error(errorMessage(error));
      setLoggingOut(false);
    }
  }
  return <aside id="main-navigation" aria-label="Main navigation" className={`sticky top-0 z-20 hidden h-dvh self-start shrink-0 border-r border-border bg-card/70 backdrop-blur-xl transition-all lg:block ${isCollapsed ? 'w-20' : 'w-64'}`}>
    <div className="flex h-full flex-col overflow-y-auto p-4">
    <Link href="/" aria-label="Social Network home" className="mb-6 mt-2 block shrink-0"><img src={isCollapsed ? '/favicon.svg' : '/logo.svg'} alt="Social Network" className={isCollapsed ? 'mx-auto h-10 w-10 object-contain' : 'h-16 w-full object-contain dark:brightness-125'} /></Link>
    <nav className="space-y-2">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={label} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon size={21} className="shrink-0" />{!isCollapsed && <span>{label}</span>}
      {/* A live region has to exist before its text changes, so the region is the
          always-mounted wrapper and the badge inside it appears later — that way
          the first count is announced instead of missed. The badge keeps its own
          aria-label, which is what names it inside the link. Red-600 and teal-700
          clear 4.5:1 against white here; red-500 and teal-600 are only ~3.7:1,
          which fails at this text size. */}
      {href === '/notifications' && <span role="status" aria-live="polite">{!!badges?.notifications && <span aria-label={`${badges?.notifications} unread notifications`} className="rounded-full bg-red-600 px-1.5 text-xs text-white">{badges?.notifications}</span>}</span>}
      {href === '/messages' && <span role="status" aria-live="polite">{!!badges?.messages && <span aria-label={`${badges?.messages} unread messages`} className="flex items-center gap-1 rounded-full bg-teal-700 px-1.5 text-xs text-white"><MessageSquare size={11} aria-hidden="true" />{badges?.messages}</span>}</span>}
    </Link>)}</nav>
    <Link href="/create-post" title="Create post" className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-blue-600 to-teal-700 p-3 text-white"><CirclePlus size={20} />{!isCollapsed && 'Create Post'}</Link>
    <div className="mt-auto shrink-0 border-t border-border pt-4 space-y-3">
      <ThemeToggle compact={isCollapsed} label={!isCollapsed} className={isCollapsed ? 'mx-auto' : ''} />
      <Link href="/profile" className="flex items-center gap-2"><Avatar name={displayName(user)} avatarUrl={user.avatar} />{!isCollapsed && <div className="min-w-0"><p className="truncate font-medium">{displayName(user)}</p><p className="truncate text-xs text-muted">@{user.nickname}</p></div>}</Link>

      <button disabled={loggingOut} onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface-2 disabled:opacity-50"><LogOut size={18} />{!isCollapsed && (loggingOut ? 'Signing out...' : 'Sign out')}</button>
    </div>
    </div>
    <button aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setIsCollapsed(!isCollapsed)} className="glass-track absolute -right-3 top-1/2 rounded-full p-1.5 text-muted">{isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
  </aside>;
}
