'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type SocialUser, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';

export default function EditProfile({ profile, close, saved }: { profile: SocialUser; close: () => void; saved: () => void }) {
  const { refreshUser } = useBackend();
  const [form, setForm] = useState(profile);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const updated = { ...form, avatar: avatar ? (await upload(avatar)).url : form.avatar, coverPhoto: cover ? (await upload(cover)).url : form.coverPhoto };
      await request('/users/me', 'PUT', updated); await refreshUser(); saved(); close(); toast.success('Profile saved');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Edit profile"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 space-y-4"><h2 className="text-xl font-bold">Edit profile</h2>
    {(['firstName', 'lastName', 'nickname', 'location'] as const).map(field => <label key={field} className="block text-sm font-medium">{{ firstName: 'First name', lastName: 'Last name', nickname: 'Username', location: 'Location' }[field]}<input required={field !== 'location'} minLength={field === 'nickname' ? 2 : 1} maxLength={field === 'location' ? 50 : field === 'nickname' ? 33 : 50} pattern={field === 'nickname' ? '[a-zA-Z0-9_]{2,33}' : undefined} value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>)}
    <label className="block text-sm font-medium">Bio<textarea maxLength={1000} rows={3} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
    <label className="block text-sm font-medium">Profile photo<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => setAvatar(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
    <label className="block text-sm font-medium">Cover photo<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => setCover(event.target.files?.[0] || null)} className="mt-1 block w-full" /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublic} onChange={event => setForm({ ...form, isPublic: event.target.checked })} />Public profile</label>
    <div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={busy}>Cancel</button><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving?' : 'Save changes'}</button></div>
  </form></div>;
}
