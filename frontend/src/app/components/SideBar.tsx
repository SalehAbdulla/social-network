'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, CirclePlus, Compass, House, MessageSquare, UserRound, Users, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { UserButton, useClerk } from '@clerk/nextjs';
import toast from 'react-hot-toast';
import { devUserEnabled, displayName, errorMessage } from '../api/social';
import { useBackend } from './BackendProvider';
import { useResource } from '../lib/useResource';
import { useEffect, useState } from 'react';
import Avatar from './Avatar';

function ClerkActions() {
  const { signOut } = useClerk();
  return <><UserButton /><button aria-label="Sign out" onClick={() => void signOut()}><LogOut size={18} /></button></>;
}
export default function Sidebar({ isSideBarOpen, setSideBarOpen, isCollapsed, setIsCollapsed }: {
  isSideBarOpen: boolean; setSideBarOpen: (open: boolean) => void;
  isCollapsed: boolean; setIsCollapsed: (collapsed: boolean) => void;
}) {
  const { user, switchUser, devEmail } = useBackend();
  const pathname = usePathname();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const count = useResource<{ count: number }>('/notifications/unread-count');
  const reload = count.reload;
  useEffect(() => {
    const timer = setInterval(reload, 30000);
    window.addEventListener('social:socket', reload);
    window.addEventListener('social:notifications', reload);
    return () => { clearInterval(timer); window.removeEventListener('social:socket', reload); window.removeEventListener('social:notifications', reload); };
  }, [reload]);
  const links = [
    { href: '/', label: 'Feed', icon: House }, { href: '/messages', label: 'Messages', icon: MessageSquare },
    { href: '/connections', label: 'Connections', icon: Users }, { href: '/discover', label: 'Discover', icon: Compass },
    { href: '/notifications', label: 'Notifications', icon: Bell }, { href: '/profile', label: 'Profile', icon: UserRound },
  ];
  return <aside className={`relative h-screen shrink-0 border-r border-slate-200 bg-white flex flex-col p-4 transition-all max-sm:fixed max-sm:left-0 max-sm:top-0 max-sm:z-40 ${isCollapsed ? 'w-20' : 'w-64'} ${isSideBarOpen ? '' : 'max-sm:-translate-x-full'}`}>
    <Link href="/" className="mb-8 mt-2 text-xl font-bold text-blue-700">{isCollapsed ? 'S' : 'Social Network'}</Link>
    <nav className="space-y-2">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} title={label} onClick={() => setSideBarOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${pathname === href || (href !== '/' && pathname.startsWith(href + '/')) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>
      <Icon size={21} className="shrink-0" />{!isCollapsed && <span>{label}</span>}
      {href === '/notifications' && !!count.data?.count && <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">{count.data.count}</span>}
    </Link>)}</nav>
    <Link href="/create-post" title="Create post" className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 p-3 text-white"><CirclePlus size={20} />{!isCollapsed && 'Create Post'}</Link>
    <div className="mt-auto border-t border-slate-100 pt-4 space-y-3">
      <Link href="/profile" className="flex items-center gap-2"><Avatar name={displayName(user)} avatarUrl={user.avatar} />{!isCollapsed && <div className="min-w-0"><p className="truncate font-medium">{displayName(user)}</p><p className="truncate text-xs text-slate-500">@{user.nickname}</p></div>}</Link>
      {devUserEnabled ? !isCollapsed && <label className="block text-xs text-slate-500">Development user<select aria-label="Development user" disabled={switching} value={devEmail} onChange={async event => {
        setSwitching(true); try { await switchUser(event.target.value); router.push("/"); } catch (error) { toast.error(errorMessage(error)); } finally { setSwitching(false); }
      }} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-slate-700"><option value="dummy@example.com">Dummy User</option><option value="alex@example.com">Alex Demo</option></select></label> : <div className="flex items-center justify-between"><ClerkActions /></div>}
    </div>
    <button aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setIsCollapsed(!isCollapsed)} className="absolute -right-3 top-1/2 rounded-full border border-slate-200 bg-white p-1 shadow max-sm:hidden">{isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
  </aside>;
}
