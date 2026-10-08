'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { LogOut, Plus, X } from 'lucide-react';
import { displayName, errorMessage, removeSavedAccount, request, switchAccount, type SavedAccount } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';
import Avatar from './Avatar';

export default function SwitchAccounts({ open, onClose, accounts, activeUserId, refreshAccounts }: {
  open: boolean;
  onClose: () => void;
  accounts: SavedAccount[];
  activeUserId: string;
  refreshAccounts: () => Promise<void>;
}) {
  const dialog = useDialogFocus<HTMLDivElement>(onClose, { enabled: open });
  const [busy, setBusy] = useState('');

  if (!open) return null;

  async function activate(account: SavedAccount) {
    if (busy) return;
    if (account.userId === activeUserId) { onClose(); return; }
    setBusy(account.userId);
    try {
      await switchAccount(account.userId);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/';
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy('');
      void refreshAccounts();
    }
  }

  async function forget(account: SavedAccount) {
    if (busy) return;
    setBusy(account.userId);
    try {
      await removeSavedAccount(account.userId);
      if (account.userId === activeUserId) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/';
        return;
      }
      await refreshAccounts();
      setBusy('');
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy('');
    }
  }

  async function logOutAll() {
    if (busy) return;
    setBusy('all');
    try {
      await request('/auth/logout', 'POST');
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy('');
    }
  }

  function addAccount() {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Switch accounts"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm space-y-2 rounded-2xl bg-card p-4 shadow-xl">
        <h2 className="px-1 pb-1 text-lg font-bold">Switch accounts</h2>
        <ul className="space-y-1">
          {accounts.map(account => (
            <li key={account.userId}>
              <div className="flex items-center gap-2 rounded-xl p-2 hover:bg-rail-hover">
                <button
                  type="button"
                  disabled={busy !== ''}
                  aria-current={account.userId === activeUserId ? 'true' : undefined}
                  onClick={() => void activate(account)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                >
                  <Avatar name={displayName(account)} avatarUrl={account.avatar} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-text">{account.nickname}</span>
                    <span className="block truncate text-sm text-muted">{displayName(account)}</span>
                  </span>
                  {account.userId === activeUserId && <span className="shrink-0 text-xs font-semibold text-muted">Active</span>}
                </button>
                {account.userId !== activeUserId && (
                  <button
                    type="button"
                    disabled={busy !== ''}
                    aria-label={`Remove ${account.nickname}`}
                    title="Remove account"
                    onClick={() => void forget(account)}
                    className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-rail-hover hover:text-danger disabled:opacity-50"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {accounts.length === 0 && <p className="px-2 py-3 text-sm text-muted">No saved accounts.</p>}
        <div className="space-y-1 border-t border-border pt-2">
          <button type="button" disabled={busy !== ''} onClick={addAccount} className="flex min-h-[50px] w-full items-center gap-3 rounded-xl px-3 text-left text-text hover:bg-rail-hover disabled:opacity-50">
            <Plus size={20} aria-hidden="true" />Add account
          </button>
          <button type="button" disabled={busy !== ''} onClick={() => void logOutAll()} className="flex min-h-[50px] w-full items-center gap-3 rounded-xl px-3 text-left text-danger hover:bg-rail-hover disabled:opacity-50">
            <LogOut size={20} aria-hidden="true" />Log out of all accounts
          </button>
        </div>
      </div>
    </div>
  );
}
