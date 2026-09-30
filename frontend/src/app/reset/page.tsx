'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { errorMessage, resetPassword } from '../api/social';

// The token arrives in the query string of the link. useSearchParams needs a
// Suspense boundary around it, which is what the default export below provides.
function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      toast.success(await resetPassword(token, password, confirmPassword));
      // No session is created by a reset, and every session the account had is
      // revoked, so signing in again is the next step by construction.
      router.replace('/login');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="glass-strong w-full max-w-md space-y-4 rounded-2xl bg-white/90 p-6 text-center sm:p-8 dark:bg-card/80">
        <h2 className='text-2xl font-bold text-brand-deep'>This link is incomplete</h2>
        <p className='text-sm text-slate-500'>The address is missing its token, which happens when a link is truncated by a mail client. Ask for a new one.</p>
        <Link href='/forgot' className='inline-block text-sm text-blue-600'>Request a new link</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glass-strong w-full max-w-md space-y-5 rounded-2xl bg-white/90 p-6 sm:p-8 dark:bg-card/80">
      <div>
        <h2 className='text-2xl font-bold text-brand-deep'>Choose a new password</h2>
        <p className='mt-1 text-sm text-slate-500'>The link works once. Signing in again after this needs the new password.</p>
      </div>
      <label className='block text-sm text-slate-700'>
        New password
        <input name='password' type='password' required minLength={12} autoComplete='new-password' value={password} onChange={event => setPassword(event.target.value)} className='mt-1 w-full rounded-lg border border-slate-200 p-2.5' />
      </label>
      <div className='text-xs text-slate-500'>At least 12 characters, with a letter, a number and a symbol.</div>
      <label className='block text-sm text-slate-700'>
        Confirm password
        <input name='confirmPassword' type='password' required minLength={12} autoComplete='new-password' value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className='mt-1 w-full rounded-lg border border-slate-200 p-2.5' />
      </label>
      <button disabled={busy} className='w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
        {busy ? 'Please wait...' : 'Set new password'}
      </button>
      <Link href='/login' className='block text-center text-sm text-blue-600'>Back to sign in</Link>
    </form>
  );
}

export default function Reset() {
  return (
    <div className='flex min-h-screen items-center justify-center p-6 sm:p-10'>
      <Suspense fallback={<div className='text-sm text-slate-500'>Loading...</div>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
