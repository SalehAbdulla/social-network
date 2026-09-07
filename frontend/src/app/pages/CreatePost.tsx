'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from '../components/BackendProvider';
import Avatar from '../components/Avatar';

export default function CreatePost() {
  const { user } = useBackend();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  async function publish(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const imageUrls = [];
      for (const file of images) imageUrls.push((await upload(file)).url);
      await request('/posts', 'POST', { title, content, imageUrls });
      toast.success('Post published'); router.push('/');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-2xl p-6 sm:p-8 space-y-6"><h1 className="text-3xl font-bold">Create Post</h1><form onSubmit={publish} className="rounded-xl bg-white p-6 shadow-sm space-y-5"><div className="flex items-center gap-3"><Avatar name={displayName(user)} avatarUrl={user.avatar} /><div><p className="font-medium">{displayName(user)}</p><p className="text-sm text-slate-500">@{user.nickname}</p></div></div>
    <label className="block text-sm font-medium">Title<input required minLength={3} maxLength={30} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="Give your post a title" /></label>
    <label className="block text-sm font-medium">Your post<textarea required={!images.length} minLength={images.length ? 0 : 10} maxLength={500} rows={6} value={content} onChange={event => setContent(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="What's happening?" /></label>
    <label className="block text-sm text-slate-600">Photos (up to 4, 10 MB each)<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={event => { const files = Array.from(event.target.files || []); if (files.length > 4) toast.error('Choose up to four photos'); else setImages(files); }} className="mt-2 block w-full rounded-lg border border-slate-200 p-2" /></label>
    {images.map((file, index) => <div key={`${file.name}-${index}`} className="flex justify-between text-sm"><span>{file.name}</span><button type="button" onClick={() => setImages(images.filter((_, i) => i !== index))}>Remove</button></div>)}
    <button disabled={busy} className="rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 px-6 py-3 text-white disabled:opacity-50">{busy ? 'Publishing?' : 'Publish Post'}</button>
  </form></div>;
}
