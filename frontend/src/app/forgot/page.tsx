'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { errorMessage, requestPasswordReset } from '../api/social';

/*
 * The page asks for a link and then displays whatever the server said. That
 * sentence is deliberately the same whether or not the address has an account, so
 * this page must not add its own wording — "we sent it to you" would undo the one
 * property the endpoint was built to have.
 */
const Forgot = () => {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    try {
      setStatus(await requestPasswordReset(email));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center p-6 sm:p-10'>
      <form onSubmit={submit} className="glass-strong w-full max-w-md space-y-5 rounded-2xl bg-white/90 p-6 sm:p-8 dark:bg-card/80">
        <div>
          <h2 className='text-2xl font-bold text-brand-deep'>Forgot your password?</h2>
          <p className='mt-1 text-sm text-slate-500'>Enter your email address and we will send a link to choose a new one.</p>
        </div>
        <label className='block text-sm text-slate-700'>
          Email
          <input name='email' type='email' required autoComplete='email' className='mt-1 w-full rounded-lg border border-slate-200 p-2.5' />
        </label>
        <button disabled={busy} className='w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50'>
          {busy ? 'Please wait...' : 'Send reset link'}
        </button>
        {status && (
          <p role='status' aria-live='polite' className='rounded-lg bg-teal-50 p-3 text-sm text-teal-800'>{status}</p>
        )}
        <Link href='/login' className='block text-center text-sm text-blue-600'>Back to sign in</Link>
      </form>
    </div>
  );
};

export default Forgot;
