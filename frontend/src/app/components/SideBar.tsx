'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bell, Compass, House, Menu, MessageCircle, Search as SearchIcon, SquarePlus, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request } from '../api/social';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import ChangePassword from './ChangePassword';
import SidePanels, { type PanelKind } from './SidePanels';
import { MenuPanel } from './PopoverMenu';
import { MoreMenuContent, RowBody, rowClass } from './SideBarMenus';
import { RAIL_AVATAR_SIZE } from '../lib/sizing';
import { useCreatePost } from '../lib/useCreatePost';

type NavItem = { key: string; label: string; icon: LucideIcon; href?: string; panel?: PanelKind; create?: boolean };

export default function Sidebar() {
  const { user, badges } = useBackend();
  const pathname = usePathname();
  const create = useCreatePost();
  const [panelKind, setPanelKind] = useState<PanelKind | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [moreRect, setMoreRect] = useState<DOMRect | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    closeTimer.current = window.setTimeout(() => { setPanelKind(null); closeTimer.current = null; }, 250);
  }, []);
  const openPanel = useCallback((kind: PanelKind) => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setPanelKind(kind);
    setPanelOpen(true);
  }, []);
  const togglePanel = (kind: PanelKind) => { if (panelKind === kind && panelOpen) closePanel(); else openPanel(kind); };
  const closeOverlays = () => { if (panelKind) closePanel(); setMoreRect(null); };

  useEffect(() => {
    if (!panelKind && !moreRect) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (railRef.current?.contains(target) || panelRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closePanel(); setMoreRect(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [panelKind, moreRect, closePanel]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (moreRect) setMoreRect(null);
      else if (panelKind) closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreRect, panelKind, closePanel]);

  useEffect(() => {
    const onResize = () => setMoreRect(null);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function logout() {
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

  const toggleMore = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMoreRect(open => open ? null : rect);
  };

  const items: NavItem[] = [
    { key: 'feed', label: 'Feed', icon: House, href: '/' },
    { key: 'messages', label: 'Messages', icon: MessageCircle, href: '/messages' },
    { key: 'discover', label: 'Discover', icon: Compass, href: '/discover' },
    { key: 'search', label: 'Search', icon: SearchIcon, panel: 'search' },
    { key: 'notifications', label: 'Notifications', icon: Bell, href: '/notifications' },
    { key: 'profile', label: 'Profile', icon: UserRound, href: '/profile' },
    { key: 'create', label: 'Create', icon: SquarePlus, create: true },
  ];
  const current = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  const badgeFor = (key: string) => key === 'notifications' ? (badges?.notifications ?? 0) : key === 'messages' ? (badges?.messages ?? 0) : 0;

  const rowFor = (item: NavItem) => {
    const active = item.panel ? panelKind === item.panel : item.create ? create.isOpen : item.href ? current(item.href) : false;
    const body = <RowBody label={item.label} active={active} badge={badgeFor(item.key)}>
      {item.key === 'profile'
        ? <Avatar name={displayName(user)} avatarUrl={user.avatar} size={RAIL_AVATAR_SIZE} className={active ? 'ring-2 ring-text' : ''} />
        : <item.icon aria-hidden="true" />}
    </RowBody>;
    if (item.href) return <Link key={item.key} href={item.href} aria-current={active ? 'page' : undefined} aria-label={item.label} className={rowClass} onClick={closeOverlays}>{body}</Link>;
    if (item.panel) return <button key={item.key} type="button" aria-label={item.label} aria-expanded={panelKind === item.panel} aria-controls="app-panel" className={rowClass} onClick={() => togglePanel(item.panel as PanelKind)}>{body}</button>;
    return <button key={item.key} type="button" aria-label={item.label} aria-expanded={create.isOpen} className={rowClass} onClick={() => { setMoreRect(null); create.open(); }}>{body}</button>;
  };

  return <>
    <aside ref={railRef} id="main-navigation" aria-label="Main navigation" data-panel-open={panelKind ? 'true' : 'false'} className="app-rail fixed inset-y-0 left-0 z-40 hidden border-r border-rail-border bg-rail md:block">
      <div className="flex h-full flex-col px-3 py-2 font-sans leading-5">
        <Link href="/" aria-label="Social Network home" className="mb-8 mt-4 flex h-[var(--rail-wordmark)] shrink-0 items-center px-3">
          <img src="/logo.svg" alt="" className="app-rail-wordmark w-auto object-contain dark:brightness-125" />
          <img src="/favicon.svg" alt="" className="app-rail-mark mx-auto shrink-0 max-w-none object-contain" />
        </Link>
        <nav aria-label="Primary" className="space-y-[var(--rail-row-gap)]">{items.map(rowFor)}</nav>
        <div className="mt-auto space-y-[var(--rail-row-gap)]">
          <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={!!moreRect} onClick={toggleMore} className={rowClass}>
            <RowBody label="More" active={!!moreRect}><Menu aria-hidden="true" /></RowBody>
          </button>
        </div>
      </div>
    </aside>
    {panelKind && <SidePanels kind={panelKind} open={panelOpen} onClose={closePanel} panelRef={panelRef} />}
    {moreRect && <MenuPanel menuRef={menuRef} rect={moreRect} width={266} placement="above" label="More">
      <MoreMenuContent onClose={() => setMoreRect(null)} onLogout={() => void logout()} onSettings={() => setChangingPassword(true)} onSwitchAccounts={() => window.dispatchEvent(new Event('social:switch-accounts'))} loggingOut={loggingOut} />
    </MenuPanel>}
    {create.modal}
    {changingPassword && <ChangePassword close={() => setChangingPassword(false)} />}
  </>;
}
