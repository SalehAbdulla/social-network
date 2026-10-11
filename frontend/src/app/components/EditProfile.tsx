'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { type SocialUser, errorMessage, request, upload } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';
import { FIELD_CLASS, LABEL_CLASS, OPTION_CLASS, dateYearsAgo, emailProblem, nameProblem, nicknameProblem } from '../lib/accountRules';
import { useBackend } from './BackendProvider';
import Button from './ui/Button';
import ImagePicker from './ImagePicker';

const CONTACT_FIELDS = [
  ['website', 'showWebsite', 'Website', 'url', 200, 'https://example.com'],
  ['contactEmail', 'showContactEmail', 'Email', 'email', 254, 'you@example.com'],
  ['phone', 'showPhone', 'Phone', 'tel', 30, '+1 555 000 0000'],
] as const;

const TEXT_FIELDS = [
  ['firstName', 'First name', 50],
  ['lastName', 'Last name', 50],
  ['nickname', 'Username', 33],
  ['location', 'Location', 50],
] as const;

export default function EditProfile({ profile, close, saved }: { profile: SocialUser; close: () => void; saved: () => void }) {
  const { user, refreshUser } = useBackend();
  // The address the member signs in with. Their own profile read carries it, the
  // session is the next answer, and `/auth/me` — which has returned it since the
  // first version of the API — is the last resort, so the field is never blank.
  const [fallbackEmail, setFallbackEmail] = useState('');
  useEffect(() => {
    if (profile.email || user.email) return;
    let cancelled = false;
    void request<{ email: string }>('/auth/me')
      .then(me => { if (!cancelled) setFallbackEmail(me.email ?? ''); })
      .catch(() => { /* the field simply keeps whatever we have */ });
    return () => { cancelled = true; };
  }, [profile.email, user.email]);
  const accountEmail = profile.email || user.email || fallbackEmail;
  const dialog = useDialogFocus<HTMLDivElement>(close);
  const [form, setForm] = useState(profile);
  const [avatar, setAvatar] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [visibilityPrompt, setVisibilityPrompt] = useState<boolean | null>(null);
  const visibilityDialog = useDialogFocus<HTMLDivElement>(() => setVisibilityPrompt(null), { enabled: visibilityPrompt !== null });

  // The same rules the API applies, answered under the field that broke one
  // instead of a single "something is wrong" after the save.
  function problemFor(field: (typeof TEXT_FIELDS)[number][0]): string {
    if (field === 'nickname') return nicknameProblem(form.nickname);
    if (field === 'location') return '';
    return nameProblem(form[field]);
  }
  const contactProblem = form.contactEmail ? emailProblem(form.contactEmail) : '';
  const firstProblem = TEXT_FIELDS.map(([field]) => problemFor(field)).find(Boolean) ?? contactProblem;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (firstProblem) { toast.error(firstProblem); return; }
    setBusy(true);
    try {
      const updated = { ...form, avatar: avatar.length ? (await upload(avatar[0])).url : form.avatar };
      await request('/users/me', 'PUT', updated); await refreshUser(); saved(); close(); toast.success('Profile saved');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <>
  <div ref={dialog} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit profile"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl bg-card p-4 sm:p-6"><h2 className="text-xl font-bold text-text">Edit profile</h2>
    {TEXT_FIELDS.map(([field, label, maxLength]) => {
      const problem = problemFor(field);
      return <label key={field} className={LABEL_CLASS}>{label}
        <input
          required={field !== 'location'}
          minLength={field === 'nickname' ? 2 : 1}
          maxLength={maxLength}
          pattern={field === 'nickname' ? '[a-zA-Z0-9_]{2,33}' : undefined}
          aria-invalid={!!problem}
          value={form[field]}
          onChange={event => setForm({ ...form, [field]: field === 'nickname' ? event.target.value.toLowerCase() : event.target.value })}
          className={FIELD_CLASS}
        />
        {field === 'nickname' && <span className="text-xs text-muted">Your handle is stored in lower case, exactly as it is shown here.</span>}
        {!!problem && <span className="text-xs text-red-700" role="alert">{problem}</span>}
      </label>;
    })}
    <label className={LABEL_CLASS}>Email
      <input readOnly value={accountEmail} aria-label="Account email" className={`${FIELD_CLASS} opacity-70`} />
      <span className="text-xs text-muted">This is the address you sign in with, and only you can see it here.</span>
    </label>
    <label className={LABEL_CLASS}>Gender
      <select value={form.gender ?? ''} onChange={event => setForm({ ...form, gender: event.target.value })} className={FIELD_CLASS}>
        <option value="" className={OPTION_CLASS}>Prefer not to say</option>
        <option value="female" className={OPTION_CLASS}>Female</option>
        <option value="male" className={OPTION_CLASS}>Male</option>
      </select>
    </label>
    <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={form.showGender} onChange={event => setForm({ ...form, showGender: event.target.checked })} />Show gender on my profile</label>
    <label className={LABEL_CLASS}>Date of birth
      <input
        type="date"
        required
        min={dateYearsAgo(100)}
        max={dateYearsAgo(13)}
        value={form.birthDate ?? ''}
        onChange={event => setForm({ ...form, birthDate: event.target.value })}
        className={FIELD_CLASS}
      />
    </label>
    <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={form.showBirthDate} onChange={event => setForm({ ...form, showBirthDate: event.target.checked })} />Show date of birth on my profile</label>
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold text-text">Contact info <span className="font-normal text-muted">(optional)</span></p>
      <p className="text-xs text-muted">Only what you switch on is shown to other people.</p>
      {CONTACT_FIELDS.map(([field, shown, label, type, maxLength, placeholder]) => <div key={field}>
        <label className="block text-sm text-text">{label}<input type={type} maxLength={maxLength} placeholder={placeholder} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} className={FIELD_CLASS} /></label>
        <label className="mt-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={!!form[field] && form[shown]} disabled={!form[field]} onChange={event => setForm({ ...form, [shown]: event.target.checked })} />Show on my profile</label>
      </div>)}
      {!!contactProblem && <p className="text-xs text-red-700" role="alert">{contactProblem}</p>}
    </div>
    <label className={LABEL_CLASS}>Bio<textarea maxLength={1000} rows={3} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className={FIELD_CLASS} /></label>
    <div><span className={LABEL_CLASS}>Profile photo</span><div className="mt-1"><ImagePicker files={avatar} onChange={setAvatar} max={1} disabled={busy} purpose="avatar" /></div></div>
    <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={form.isPublic} onChange={event => setVisibilityPrompt(event.target.checked)} />Public profile</label>
    <div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-text">Cancel</button><button disabled={busy || !!firstProblem} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save changes'}</button></div>
  </form></div>
  {visibilityPrompt !== null && <div ref={visibilityDialog} role="dialog" aria-modal="true" aria-labelledby="visibility-confirm" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setVisibilityPrompt(null)}>
    <div className="my-auto max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-xl bg-card p-5" onClick={event => event.stopPropagation()}>
      <p id="visibility-confirm" className="text-sm text-text">{visibilityPrompt ? 'Make your profile public? Anyone on the network will be able to see your profile and your posts, and any follow request waiting on you is accepted straight away.' : 'Make your profile private? Only your followers will be able to see your profile and your posts.'}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setVisibilityPrompt(null)}>Cancel</Button>
        <Button onClick={() => { setForm(current => ({ ...current, isPublic: visibilityPrompt })); setVisibilityPrompt(null); }}>Confirm</Button>
      </div>
    </div>
  </div>}
  </>;
}
