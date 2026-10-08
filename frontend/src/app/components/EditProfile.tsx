'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type SocialUser, errorMessage, request, upload } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';
import { useBackend } from './BackendProvider';
import Button from './ui/Button';
import ImagePicker from './ImagePicker';

const CONTACT_FIELDS = [
  ['website', 'showWebsite', 'Website', 'url', 200, 'https://example.com'],
  ['contactEmail', 'showContactEmail', 'Email', 'email', 254, 'you@example.com'],
  ['phone', 'showPhone', 'Phone', 'tel', 30, '+1 555 000 0000'],
] as const;

export default function EditProfile({ profile, close, saved }: { profile: SocialUser; close: () => void; saved: () => void }) {
  const { refreshUser } = useBackend();
  const dialog = useDialogFocus<HTMLDivElement>(close);
  const [form, setForm] = useState(profile);
  const [avatar, setAvatar] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [visibilityPrompt, setVisibilityPrompt] = useState<boolean | null>(null);
  const visibilityDialog = useDialogFocus<HTMLDivElement>(() => setVisibilityPrompt(null), { enabled: visibilityPrompt !== null });
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const updated = { ...form, avatar: avatar.length ? (await upload(avatar[0])).url : form.avatar };
      await request('/users/me', 'PUT', updated); await refreshUser(); saved(); close(); toast.success('Profile saved');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <>
  <div ref={dialog} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit profile"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 space-y-4"><h2 className="text-xl font-bold">Edit profile</h2>
    {(['firstName', 'lastName', 'nickname', 'location'] as const).map(field => <label key={field} className="block text-sm font-medium">{{ firstName: 'First name', lastName: 'Last name', nickname: 'Username', location: 'Location' }[field]}<input required={field !== 'location'} minLength={field === 'nickname' ? 2 : 1} maxLength={field === 'location' ? 50 : field === 'nickname' ? 33 : 50} pattern={field === 'nickname' ? '[a-zA-Z0-9_]{2,33}' : undefined} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>)}
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold">Contact info <span className="font-normal text-slate-400">(optional)</span></p>
      <p className="text-xs text-slate-400">Only what you switch on is shown to other people.</p>
      {CONTACT_FIELDS.map(([field, shown, label, type, maxLength, placeholder]) => <div key={field}>
        <label className="block text-sm">{label}<input type={type} maxLength={maxLength} placeholder={placeholder} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
        <label className="mt-1 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={!!form[field] && form[shown]} disabled={!form[field]} onChange={event => setForm({ ...form, [shown]: event.target.checked })} />Show on my profile</label>
      </div>)}
    </div>
    <label className="block text-sm font-medium">Bio<textarea maxLength={1000} rows={3} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
    <div><span className="block text-sm font-medium">Profile photo</span><div className="mt-1"><ImagePicker files={avatar} onChange={setAvatar} max={1} disabled={busy} purpose="avatar" /></div></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={event => setVisibilityPrompt(event.target.checked)} />Public profile</label>
    <div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={busy}>Cancel</button><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving?' : 'Save changes'}</button></div>
  </form></div>
  {visibilityPrompt !== null && <div ref={visibilityDialog} role="dialog" aria-modal="true" aria-labelledby="visibility-confirm" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setVisibilityPrompt(null)}>
    <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5" onClick={event => event.stopPropagation()}>
      <p id="visibility-confirm" className="text-sm text-slate-700">{visibilityPrompt ? 'Make your profile public? Anyone on the network will be able to see your profile and your posts.' : 'Make your profile private? Only your followers will be able to see your profile and your posts.'}</p>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => setVisibilityPrompt(null)}>Cancel</Button>
        <Button onClick={() => { setForm(current => ({ ...current, isPublic: visibilityPrompt })); setVisibilityPrompt(null); }}>Confirm</Button>
      </div>
    </div>
  </div>}
  </>;
}
