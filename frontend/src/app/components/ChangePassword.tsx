'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { changePassword, errorMessage } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';

/**
 * The account's password dialog, opened from the own profile. The rules it
 * states are the ones the server enforces: at least twelve characters with a
 * letter, a number and a symbol, and the confirmation has to match — which the
 * server checks again rather than trusting this form.
 */
export default function ChangePassword({ close }: { close: () => void }) {
  // Same keyboard contract as the profile dialog: focus lands on the first
  // field, Escape closes, and the tab cycle stays inside.
  const dialog = useDialogFocus<HTMLDivElement>(close);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await changePassword(current, next, confirm);
      // The session cookie this tab holds was rotated by the response, so there
      // is no client state to update — only the dialog to close.
      toast.success('Password changed');
      close();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Change password"
    >
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-xl bg-card p-6">
        <h2 className="text-xl font-bold">Change password</h2>
        <p className="text-sm text-muted">
          Changing your password signs out every other browser signed in to this account.
        </p>

        <label className="block text-sm font-medium">
          Current password
          <input
            required
            type="password"
            name="currentPassword"
            aria-label="Current password"
            autoComplete="current-password"
            value={current}
            onChange={event => setCurrent(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border p-2"
          />
        </label>

        <label className="block text-sm font-medium">
          New password
          <input
            required
            type="password"
            name="newPassword"
            aria-label="New password"
            autoComplete="new-password"
            minLength={12}
            maxLength={64}
            value={next}
            onChange={event => setNext(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border p-2"
          />
        </label>
        <p className="text-xs text-muted">At least 12 characters, with a letter, a number and a symbol.</p>

        <label className="block text-sm font-medium">
          Confirm new password
          <input
            required
            type="password"
            name="confirmPassword"
            aria-label="Confirm new password"
            autoComplete="new-password"
            minLength={12}
            maxLength={64}
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border p-2"
          />
        </label>
        {mismatch && <p className="text-sm text-danger" role="alert">The two new passwords do not match.</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={close} disabled={busy} className="rounded-lg border border-border px-4 py-2">
            Cancel
          </button>
          <button disabled={busy || mismatch} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}
