'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { assets } from '../../../public/assets';
import { Star } from 'lucide-react';
import { authRequest, errorMessage, nicknameAvailability } from '../api/social';

const Login = () => {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameState, setNicknameState] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!registering) return;
    const normalized = nickname.trim().toLowerCase();
    if (!/^[a-z0-9_]{2,33}$/.test(normalized)) {
      setNicknameState(normalized ? 'invalid' : 'idle');
      return;
    }
    setNicknameState('checking');
    const timer = window.setTimeout(() => {
      void nicknameAvailability(normalized).then(available => setNicknameState(available ? 'available' : 'taken')).catch(() => setNicknameState('idle'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [nickname, registering]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (registering) {
        if (nicknameState !== 'available') throw new Error(nicknameState === 'taken' ? 'This nickname is already reserved.' : 'Enter an available nickname.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await authRequest('/auth/register', Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])));
      } else {
        await authRequest('/auth/login', {
          identifier: String(values.identifier || ''),
          password: String(values.password || ''),
          rememberMe: values.rememberMe === 'on' ? 'true' : 'false',
        });
      }
      router.replace('/');
      router.refresh();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className='min-h-screen flex flex-col md:flex-row'>
      {/*BackGround Image*/}
      <img src={assets.bgImage.src} alt="" className='absolute top-0 left-0 -z-1 w-full h-full object-cover'/>
      {/* left side : Branding  */}
      <div className='flex-1 flex flex-col items-start justify-between p-6 md:p-10 lg:pl-40'>
      <img src={assets.logo.src} alt="" className='h-16 object-contain' />
      <div>
        <div className='flex items-center gap-3 mb-4 max-md:mt-10'>
          <img src={assets.group_users.src} alt="" className='h-8 md:h-10' />
          <div>
            <div className='flex'>
              {Array(5).fill(0).map((_,i)=>(<Star key={i} className='size-4 md:size-4.5 text-transparent fill-amber-500'/>))}
            </div>
            <p>Used by 12k+ developers</p>
          </div>
        </div>
        <h1 className='text-3xl md:text-6xl md:pb-2 font-bold bg-linear-to-r from-brand-1 to-brand-2 bg-clip-text text-transparent'>More than just friends truly connect</h1>
        <p className='text-4xl md:text-3xl text-brand-ink max-w-72 md:max-w-md'>connect with global community on pingup.</p>
      </div>
      <span className='md:h-10'></span>
      </div>
      {/* Right side: authentication form */}
      <div className='flex-1 flex items-center justify-center p-6 sm:p-10'>
        <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl bg-white/95 p-6 shadow-lg sm:p-8">
          <div><h2 className="text-2xl font-bold text-brand-deep">{registering ? 'Create your account' : 'Welcome back'}</h2><p className="mt-1 text-sm text-slate-500">{registering ? 'Join the community and start connecting.' : 'Sign in to continue to your network.'}</p></div>
          {registering ? <>
            <div className="grid gap-4 sm:grid-cols-2"><Field name="firstName" label="First name" required /><Field name="lastName" label="Last name" required /></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm text-slate-700">Nickname<input name="nickName" value={nickname} onChange={event => setNickname(event.target.value)} required minLength={2} maxLength={33} pattern="[a-zA-Z0-9_]+" className="mt-1 w-full rounded-lg border border-slate-200 p-2.5" />{nicknameState === 'checking' && <span className="text-xs text-slate-500">Checking availability...</span>}{nicknameState === 'available' && <span className="text-xs text-teal-700">Nickname is available.</span>}{(nicknameState === 'taken' || nicknameState === 'invalid') && <span className="text-xs text-red-700">{nicknameState === 'taken' ? 'Nickname is already reserved.' : 'Use 2-33 letters, numbers, or underscores.'}</span>}</label><Field name="birthDate" label="Date of birth" type="date" min={dateYearsAgo(100)} max={dateYearsAgo(13)} required /></div>
            <Field name="email" label="Email" type="email" required />
            <div className="grid gap-4 sm:grid-cols-2"><Field name="password" label="Password" type="password" minLength={12} required onChange={setPassword} /><Field name="confirmPassword" label="Confirm password" type="password" minLength={12} required onChange={setConfirmPassword} /></div>
            <label className="block text-sm text-slate-700">Gender<select name="gender" required className="mt-1 w-full rounded-lg border border-slate-200 p-2.5"><option value="">Select gender</option><option value="female">Female</option><option value="male">Male</option></select></label>
          </> : <><Field name="identifier" label="Email or nickname" required /><Field name="password" label="Password" type="password" required /><label className="flex items-center gap-2 text-sm text-slate-600"><input name="rememberMe" type="checkbox" />Remember me</label></>}
          <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}</button>
          <button type="button" onClick={() => setRegistering(!registering)} className="w-full text-sm text-blue-600">{registering ? 'Already have an account? Sign in' : 'Need an account? Register'}</button>
        </form>
      </div>
    </div>
  )
}

function dateYearsAgo(years: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function Field({ name, label, type = 'text', min, max, minLength, required, onChange }: { name: string; label: string; type?: string; min?: string; max?: string; minLength?: number; required?: boolean; onChange?: (value: string) => void }) {
  return <label className="block text-sm text-slate-700">{label}<input name={name} type={type} min={min} max={max} minLength={minLength} required={required} onChange={event => onChange?.(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2.5" /></label>;
}

export default Login

