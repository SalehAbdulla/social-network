'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bookmark, ChevronLeft, LogOut, Moon, RefreshCw, Settings, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from './ThemeToggle';
import { MenuItem, menuRowClass } from './PopoverMenu';

/** The shared row class: a full-width 44px row on an 8px radius, both read from the `--rail-row-*`
 *  tokens in globals.css so the rail's geometry is tuned in that block rather than here. The icon
 *  the row holds is sized by the rail's own `.app-rail svg` rule and the label it holds by
 *  `.app-rail-label`, so the row carries no measurement of its own. */
export const rowClass = 'group relative flex h-[var(--rail-row-height)] items-center gap-4 rounded-[var(--rail-row-radius)] px-3 text-text transition-colors hover:bg-rail-hover active:bg-rail-hover-strong';

/** The icon + label + badge that every row shares. `children` is the icon (or the profile
 *  avatar); the label is clipped away until the rail expands, then fades in beside the icon.
 *  Nothing here sizes the icon and no wrapper transforms it: the rail's `.app-rail svg` rule and
 *  `RAIL_AVATAR_SIZE` are the only two places a rail icon's size is written, which is why the
 *  drawn size is the token rather than a per-row prop. */
export function RowBody({ label, active, badge = 0, children }: {
  label: string; active: boolean; badge?: number; children: ReactNode;
}) {
  return <>
    <span className="relative shrink-0">
      {children}
      {badge > 0 && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1 text-[10px] font-semibold leading-none text-white">{badge > 99 ? '99+' : badge}</span>}
    </span>
    <span className={`app-rail-label ${active ? 'font-bold' : 'font-normal'}`}>{label}</span>
  </>;
}

/** The More menu, with its "Switch appearance" sub-view that hosts the theme toggle. */
export function MoreMenuContent({ onClose, onLogout, loggingOut }: {
  onClose: () => void; onLogout: () => void; loggingOut: boolean;
}) {
  const [view, setView] = useState<'root' | 'appearance'>('root');
  if (view === 'appearance') return <div className="space-y-1">
    <MenuItem onClick={() => setView('root')}><ChevronLeft size={20} aria-hidden="true" /><span className="font-bold">Switch appearance</span></MenuItem>
    <div className="flex min-h-[50px] items-center justify-between gap-3 rounded-[12px] px-3 text-base text-text">
      <span>Dark mode</span>
      <ThemeToggle />
    </div>
  </div>;
  return <>
    <Link href="/profile" role="menuitem" onClick={onClose} className={menuRowClass}><Settings size={20} aria-hidden="true" />Settings</Link>
    <Link href="/saved" role="menuitem" onClick={onClose} className={menuRowClass}><Bookmark size={20} aria-hidden="true" />Saved</Link>
    <MenuItem onClick={() => setView('appearance')}><Moon size={20} aria-hidden="true" />Switch appearance</MenuItem>
    <MenuItem onClick={() => { onClose(); toast('Reporting a problem is not wired up yet.'); }}><TriangleAlert size={20} aria-hidden="true" />Report a problem</MenuItem>
    <div className="my-2 border-t-2 border-rail-border" />
    <MenuItem onClick={() => { onClose(); toast('Account switching is not available yet.'); }}><RefreshCw size={20} aria-hidden="true" />Switch accounts</MenuItem>
    <MenuItem onClick={onLogout} disabled={loggingOut}><LogOut size={20} aria-hidden="true" />{loggingOut ? 'Logging out…' : 'Log out'}</MenuItem>
  </>;
}
