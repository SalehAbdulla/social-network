'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CirclePlus, Compass, House, MessageSquare, UserRound, ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request } from '../api/social';
import { useBackend } from './BackendProvider';
import { useResource } from '../lib/useResource';
import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';
import { useLiveRefresh } from '../lib/useLiveRefresh';

export default function Sidebar({ isSideBarOpen, setSideBarOpen, isCollapsed, setIsCollapsed }: {
  isSideBarOpen: boolean; setSideBarOpen: (open: boolean) => void;
  isCollapsed: boolean; setIsCollapsed: (collapsed: boolean) => void;
}) {
  const { user } = useBackend();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 639px)');
    if (!isSideBarOpen || !mobile.matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    navigation.current?.querySelector<HTMLButtonElement>('[aria-label="Close navigation"]')?.focus();
    const closeOnDesktop = () => { if (!mobile.matches) setSideBarOpen(false); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSideBarOpen(false);
      if (event.key !== 'Tab') return;
      const controls = [...(navigation.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') || [])].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    mobile.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyboard);
      mobile.removeEventListener('change', closeOnDesktop);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isSideBarOpen, setSideBarOpen]);
  const count = useResource<{ count: number }>('/notifications/unread-count');
  const reload = count.reload;
  useLiveRefresh(reload);
  useEffect(() => {
    window.addEventListener('social:notifications', reload);
    return () => { window.removeEventListener('social:notifications', reload); };
  }, [reload]);
  const links = [
    { href: '/', label: 'Feed', icon: House }, { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/discover', label: 'Discover', icon: Compass },
    { href: '/notifications', label: 'Notifications', icon: Bell }, { href: '/profile', label: 'Profile', icon: UserRound },
  ];
  async function logout() {
    setLoggingOut(true);
    try {
      await request('/auth/logout', 'POST');
      window.location.href = '/login';
    } catch (error) {
      toast.error(errorMessage(error));
      setLoggingOut(false);
    }
  }
  return <>
    {isSideBarOpen && <button aria-label="Close navigation backdrop" tabIndex={-1} onClick={() => setSideBarOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 sm:hidden" />}
    <aside ref={navigation} id="main-navigation" aria-label="Main navigation" className={`sticky top-0 z-20 h-dvh self-start shrink-0 border-r border-border bg-card/70 backdrop-blur-xl transition-all max-sm:fixed max-sm:left-0 max-sm:top-0 max-sm:z-40 ${isCollapsed ? 'w-20' : 'w-64'} ${isSideBarOpen ? '' : 'max-sm:invisible max-sm:-translate-x-full'}`}>
    <div className="flex h-full flex-col overflow-y-auto p-4">
    <button aria-label="Close navigation" onClick={() => setSideBarOpen(false)} className="chat-icon self-end sm:hidden"><X size={20} /></button>
    <Link href="/" aria-label="Social Network home" onClick={() => setSideBarOpen(false)} className="mb-6 mt-2 block shrink-0"><img src={isCollapsed ? '/favicon.svg' : '/logo.svg'} alt="Social Network" className={isCollapsed ? 'mx-auto h-10 w-10 object-contain' : 'h-16 w-full object-contain dark:brightness-125'} /></Link>
    <nav className="space-y-2">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={label} onClick={() => setSideBarOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon size={21} className="shrink-0" />{!isCollapsed && <span>{label}</span>}
      {href === '/notifications' && !!count.data?.count && <span aria-label={`${count.data.count} unread notifications`} aria-live="polite" className="rounded-full bg-red-500 px-1.5 text-xs text-white">{count.data.count}</span>}
    </Link>)}</nav>
    <Link href="/create-post" title="Create post" onClick={() => setSideBarOpen(false)} className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-blue-600 to-teal-600 p-3 text-white"><CirclePlus size={20} />{!isCollapsed && 'Create Post'}</Link>
    <div className="mt-auto shrink-0 border-t border-border pt-4 space-y-3">
      <ThemeToggle compact={isCollapsed} label={!isCollapsed} className={isCollapsed ? 'mx-auto' : ''} />
      <Link href="/profile" onClick={() => setSideBarOpen(false)} className="flex items-center gap-2"><Avatar name={displayName(user)} avatarUrl={user.avatar} />{!isCollapsed && <div className="min-w-0"><p className="truncate font-medium">{displayName(user)}</p><p className="truncate text-xs text-muted">@{user.nickname}</p></div>}</Link>

      <button disabled={loggingOut} onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface-2 disabled:opacity-50"><LogOut size={18} />{!isCollapsed && (loggingOut ? 'Signing out...' : 'Sign out')}</button>
    </div>
    </div>
    <button aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setIsCollapsed(!isCollapsed)} className="glass-track absolute -right-3 top-1/2 rounded-full p-1.5 text-muted max-sm:hidden">{isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
  </aside></>;
}
