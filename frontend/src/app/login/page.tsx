'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { assets } from '../../../public/assets';
import { Star } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { authRequest, emailAvailability, errorMessage, nicknameAvailability, request, upload, type SocialUser } from '../api/social';
import ImagePicker from '../components/ImagePicker';
import {
  EMAIL_RULE,
  FIELD_CLASS,
  LABEL_CLASS,
  NAME_RULE,
  NICKNAME_RULE,
  OPTION_CLASS,
  PASSWORD_HINT,
  emailProblem,
  nameProblem,
  passwordProblem,
} from '../lib/accountRules';

const Login = () => {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<File[]>([]);
  const [nickname, setNickname] = useState('');
  const [nicknameResult, setNicknameResult] = useState<{ nickname: string; status: 'idle' | 'available' | 'taken' }>({ nickname: '', status: 'idle' });
  const normalizedNickname = nickname.trim().toLowerCase();
  const validNickname = /^[a-z0-9_]{2,33}$/.test(normalizedNickname);
  const nicknameState = !normalizedNickname ? 'idle' : !validNickname ? 'invalid' : nicknameResult.nickname === normalizedNickname ? nicknameResult.status : 'checking';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // The name and the address are checked as they are typed, not on submit: the
  // field that is wrong is the field that says so, while the cursor is still in it.
  const [names, setNames] = useState({ firstName: '', lastName: '' });
  const [email, setEmail] = useState('');
  const [emailResult, setEmailResult] = useState<{ email: string; status: 'idle' | 'available' | 'taken' }>({ email: '', status: 'idle' });
  const normalizedEmail = email.trim().toLowerCase();
  const emailState = !normalizedEmail
    ? 'idle'
    : emailProblem(normalizedEmail) ? 'invalid' : emailResult.email === normalizedEmail ? emailResult.status : 'checking';

  useEffect(() => {
    if (!registering || !normalizedEmail || emailProblem(normalizedEmail)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void emailAvailability(normalizedEmail).then(available => {
        if (!cancelled) setEmailResult({ email: normalizedEmail, status: available ? 'available' : 'taken' });
      }).catch(() => { if (!cancelled) setEmailResult({ email: normalizedEmail, status: 'idle' }); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [normalizedEmail, registering]);

  useEffect(() => {
    if (!registering || !validNickname) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void nicknameAvailability(normalizedNickname).then(available => {
        if (!cancelled) setNicknameResult({ nickname: normalizedNickname, status: available ? 'available' : 'taken' });
      }).catch(() => { if (!cancelled) setNicknameResult({ nickname: normalizedNickname, status: 'idle' }); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [normalizedNickname, validNickname, registering]);

  async function attachAvatar(file?: File) {
    if (!file) return;
    try {
      const uploaded = await upload(file);
      const profile = await request<SocialUser>('/users/me');
      await request('/users/me', 'PUT', { ...profile, avatar: uploaded.url });
    } catch {
      toast.error('Your account was created, but the profile photo could not be saved.');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      if (registering) {
        if (normalizedNickname && nicknameState !== 'available') throw new Error(nicknameState === 'taken' ? 'This nickname is already reserved.' : 'Enter an available nickname.');
        const nameIssue = nameProblem(String(values.firstName ?? '')) || nameProblem(String(values.lastName ?? ''));
        if (nameIssue) throw new Error(nameIssue);
        if (emailState === 'taken') throw new Error('That email address is already registered. Sign in instead.');
        const emailIssue = emailProblem(String(values.email ?? ''));
        if (emailIssue) throw new Error(emailIssue);
        const problem = passwordProblem(password);
        if (problem) throw new Error(problem);
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await authRequest('/auth/register', Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])));
        await attachAvatar(avatar[0]);
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
    <div className='relative min-h-screen flex flex-col md:flex-row md:h-screen md:overflow-hidden'>
      <img src={assets.bgImage.src} alt="" className='absolute top-0 left-0 -z-1 w-full h-full object-cover dark:opacity-30'/>
      <div className='fixed right-4 top-4 z-20'><ThemeToggle /></div>
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
        <p className='text-4xl md:text-3xl text-brand-ink max-w-72 md:max-w-md'>connect with global community on social network.</p>
      </div>
      <span className='md:h-10'></span>
      </div>
      <div className='flex-1 flex items-center justify-center p-6 sm:p-10 md:min-h-0 md:overflow-y-auto'>
        <form onSubmit={submit} className="glass-strong my-auto w-full max-w-md space-y-5 rounded-2xl bg-white/90 p-6 sm:p-8 dark:bg-card/80">
          <div><h2 className="text-2xl font-bold text-brand-deep">{registering ? 'Create your account' : 'Welcome back'}</h2><p className="mt-1 text-sm text-slate-500">{registering ? 'Join the community and start connecting.' : 'Sign in to continue to your network.'}</p></div>
          {registering ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              <NameField name="firstName" label="First name" value={names.firstName} onChange={value => setNames(current => ({ ...current, firstName: value }))} />
              <NameField name="lastName" label="Last name" value={names.lastName} onChange={value => setNames(current => ({ ...current, lastName: value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2"><label className={LABEL_CLASS}>Nickname <span className="text-muted">(optional)</span><input name="nickName" value={nickname} onChange={event => setNickname(event.target.value.toLowerCase())} minLength={2} maxLength={33} pattern="[a-zA-Z0-9_]+" className={FIELD_CLASS} />{!normalizedNickname && <span className="text-xs text-muted">Leave it blank and we will pick a handle for you. Handles are lower-case.</span>}{nicknameState === 'checking' && <span className="text-xs text-muted">Checking availability...</span>}{nicknameState === 'available' && <span className="text-xs text-teal-700">Nickname is available.</span>}{(nicknameState === 'taken' || nicknameState === 'invalid') && <span className="text-xs text-red-700">{nicknameState === 'taken' ? 'Nickname is already reserved.' : NICKNAME_RULE}</span>}</label><Field name="birthDate" label="Date of birth" type="date" min={dateYearsAgo(100)} max={dateYearsAgo(13)} required /></div>
            <label className={LABEL_CLASS}>Email
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                aria-invalid={emailState === 'invalid' || emailState === 'taken'}
                className={FIELD_CLASS}
              />
              {emailState === 'checking' && <span className="text-xs text-muted">Checking the address...</span>}
              {emailState === 'available' && <span className="text-xs text-teal-700">That address is free.</span>}
              {emailState === 'invalid' && <span className="text-xs text-red-700" role="alert">{EMAIL_RULE}</span>}
              {emailState === 'taken' && <span className="text-xs text-red-700" role="alert">
                That email address is already registered. <button type="button" className="font-semibold underline" onClick={() => setRegistering(false)}>Sign in instead</button>
              </span>}
            </label>
            <div><div className="grid gap-4 sm:grid-cols-2"><Field name="password" label="Password" type="password" required onChange={setPassword} /><Field name="confirmPassword" label="Confirm password" type="password" required onChange={setConfirmPassword} /></div><p className="mt-1 text-xs text-muted">{PASSWORD_HINT}</p></div>
            <label className={LABEL_CLASS}>Gender<select name="gender" required defaultValue="" className={FIELD_CLASS}><option value="" className={OPTION_CLASS}>Select gender</option><option value="female" className={OPTION_CLASS}>Female</option><option value="male" className={OPTION_CLASS}>Male</option></select></label>
            <label className={LABEL_CLASS}>About me <span className="text-muted">(optional)</span><textarea name="aboutMe" rows={3} maxLength={1000} placeholder="A line about yourself" className={FIELD_CLASS} /></label>
            <label className={LABEL_CLASS}>Profile visibility<select name="isPublic" defaultValue="true" className={FIELD_CLASS}><option value="true" className={OPTION_CLASS}>Public - anyone can find me</option><option value="false" className={OPTION_CLASS}>Private - only my followers</option></select></label>
            <div><span className={LABEL_CLASS}>Profile photo <span className="text-muted">(optional)</span></span><div className="mt-1"><ImagePicker files={avatar} onChange={setAvatar} max={1} disabled={busy} purpose="avatar" /></div></div>
          </> : <><Field name="identifier" label="Email or nickname" required /><Field name="password" label="Password" type="password" required /><label className="flex items-center gap-2 text-sm text-text"><input name="rememberMe" type="checkbox" />Remember me</label></>}
          <button disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}</button>
          <button type="button" onClick={() => setRegistering(!registering)} className="w-full text-sm text-blue-600">{registering ? 'Already have an account? Sign in' : 'Need an account? Register'}</button>
          {!registering && <Link href="/forgot" className="block text-center text-sm text-slate-500 hover:text-blue-600">Forgot your password?</Link>}
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

// A name field reports its own problem while it is being typed, so the reader is
// told which character is not allowed instead of finding out on submit.
function NameField({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const problem = value ? nameProblem(value) : '';
  return <label className={LABEL_CLASS}>{label}
    <input
      name={name}
      required
      maxLength={50}
      value={value}
      onChange={event => onChange(event.target.value)}
      aria-invalid={!!problem}
      className={FIELD_CLASS}
    />
    {problem
      ? <span className="text-xs text-red-700" role="alert">{problem}</span>
      : <span className="text-xs text-muted">{NAME_RULE}</span>}
  </label>;
}

function Field({ name, label, type = 'text', min, max, minLength, required, onChange }: { name: string; label: string; type?: string; min?: string; max?: string; minLength?: number; required?: boolean; onChange?: (value: string) => void }) {
  return <label className={LABEL_CLASS}>{label}<input name={name} type={type} min={min} max={max} minLength={minLength} required={required} onChange={event => onChange?.(event.target.value)} className={FIELD_CLASS} /></label>;
}

export default Login

