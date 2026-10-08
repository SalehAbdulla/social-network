'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bookmark, ChevronLeft, LogOut, Moon, RefreshCw, Settings, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import ThemeToggle from './ThemeToggle';
import { MenuItem, menuRowClass } from './PopoverMenu';

export const rowClass = 'group relative flex h-[var(--rail-row-height)] items-center gap-4 rounded-[var(--rail-row-radius)] px-3 text-text transition-colors hover:bg-rail-hover active:bg-rail-hover-strong';

export function RowBody({ label, active, badge = 0, children }: {
  label: string; active: boolean; badge?: number; children: ReactNode;
}) {
  return <>
    <span className="relative shrink-0">
      {children}
      {badge > 0 && <span aria-label={`${badge} unread ${label.toLowerCase()}`} className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-badge px-1 text-[10px] font-semibold leading-none text-white">{badge > 99 ? '99+' : badge}</span>}
    </span>
    <span className={`app-rail-label ${active ? 'font-bold' : 'font-normal'}`}>{label}</span>
  </>;
}

export function MoreMenuContent({ onClose, onLogout, onSettings, onSwitchAccounts, loggingOut }: {
  onClose: () => void; onLogout: () => void; onSettings: () => void; onSwitchAccounts: () => void; loggingOut: boolean;
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
    <MenuItem onClick={() => { onClose(); onSettings(); }}><Settings size={20} aria-hidden="true" />Settings</MenuItem>
    <Link href="/saved" role="menuitem" onClick={onClose} className={menuRowClass}><Bookmark size={20} aria-hidden="true" />Saved</Link>
    <MenuItem onClick={() => setView('appearance')}><Moon size={20} aria-hidden="true" />Switch appearance</MenuItem>
    <MenuItem onClick={() => { onClose(); toast('Reporting a problem is not wired up yet.'); }}><TriangleAlert size={20} aria-hidden="true" />Report a problem</MenuItem>
    <div className="my-2 border-t-2 border-rail-border" />
    <MenuItem onClick={() => { onClose(); onSwitchAccounts(); }}><RefreshCw size={20} aria-hidden="true" />Switch accounts</MenuItem>
    <MenuItem onClick={onLogout} disabled={loggingOut}><LogOut size={20} aria-hidden="true" />{loggingOut ? 'Logging out…' : 'Log out'}</MenuItem>
  </>;
}
