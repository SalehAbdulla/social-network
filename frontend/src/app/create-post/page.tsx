'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type FollowLists, type Post, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from '../components/BackendProvider';
import Avatar from '../components/Avatar';
import { useResource } from '../lib/useResource';

export default function CreatePost() {
  return <PostForm />;
}

export function PostForm({ post }: { post?: Post }) {
  const { user } = useBackend();
  const router = useRouter();
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(post?.imageUrls || []);
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'selected'>(post?.privacy || 'public');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>(post?.selectedFollowerIds || []);
  const [busy, setBusy] = useState(false);
  const followers = useResource<FollowLists>('/follows', privacy === 'selected');
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const audience = selectedFollowers.filter(id => followers.data?.followers.some(person => person.userId === id));
    if (privacy === 'selected' && !audience.length) { toast.error('Choose at least one follower.'); return; }
    setBusy(true);
    try {
      const imageUrls = [...existingImages];
      for (const file of images) imageUrls.push((await upload(file)).url);
      await request(post ? `/posts/${post.postId}` : '/posts', post ? 'PUT' : 'POST', { title, content, imageUrls, privacy, selectedFollowerIds: privacy === 'selected' ? audience : [] });
      toast.success(post ? 'Post updated' : 'Post published'); router.push(post ? `/post/${post.postId}` : '/');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-2xl p-6 sm:p-8 space-y-6"><h1 className="text-3xl font-bold">{post ? 'Edit Post' : 'Create Post'}</h1><form onSubmit={publish} className="rounded-xl bg-white p-6 shadow-sm space-y-5"><div className="flex items-center gap-3"><Avatar name={displayName(user)} avatarUrl={user.avatar} /><div><p className="font-medium">{displayName(user)}</p><p className="text-sm text-slate-500">@{user.nickname}</p></div></div>
    <label className="block text-sm font-medium">Title<input required minLength={3} maxLength={30} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="Give your post a title" /></label>
    <label className="block text-sm font-medium">Your post<textarea required={!images.length && !existingImages.length} minLength={images.length || existingImages.length ? 0 : 10} maxLength={500} rows={6} value={content} onChange={event => setContent(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="What's happening?" /></label>
    <label className="block text-sm font-medium">Post privacy<select value={privacy} onChange={event => setPrivacy(event.target.value as typeof privacy)} className="mt-2 block w-full rounded-lg border border-slate-200 p-3"><option value="public">Public</option><option value="followers">Followers only</option><option value="selected">Selected followers</option></select></label>
    {privacy === 'selected' && <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium">Choose followers</legend>
      {followers.loading && <p role="status" className="text-sm text-slate-500">Loading followers...</p>}
      {followers.error && <div role="alert" className="text-sm text-red-600">
        <p>{followers.error}</p>
        <button type="button" onClick={followers.reload} className="mt-2 font-medium underline">Try again</button>
      </div>}
      {followers.data && (followers.data.followers.length ? <div className="grid gap-2 sm:grid-cols-2">
        {followers.data.followers.map(follower => <label key={follower.userId} className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="checkbox" aria-label={displayName(follower)} checked={selectedFollowers.includes(follower.userId)} onChange={event => {
            const checked = event.target.checked;
            setSelectedFollowers(current => checked ? [...current, follower.userId] : current.filter(id => id !== follower.userId));
          }} className="h-4 w-4 shrink-0" />
          <Avatar name={displayName(follower)} avatarUrl={follower.avatar} size={36} />
          <span className="min-w-0">
            <span title={displayName(follower)} className="block truncate font-medium">{displayName(follower)}</span>
            <span className="block truncate text-xs text-slate-500">@{follower.nickname}</span>
          </span>
        </label>)}
      </div> : <p className="text-sm text-slate-500">You do not have any followers yet.</p>)}
    </fieldset>}
    <label className="block text-sm text-slate-600">Photos (up to 4, 10 MB each)<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={event => { const files = Array.from(event.target.files || []); if (files.length + existingImages.length > 4) toast.error('Choose up to four photos in total'); else setImages(files); }} className="mt-2 block w-full rounded-lg border border-slate-200 p-2" /></label>
    {existingImages.map((url, index) => <div key={url} className="flex items-center justify-between gap-3 text-sm"><img src={url} alt={`Post photo ${index + 1}`} className="h-20 w-20 rounded-lg object-cover" /><button type="button" onClick={() => setExistingImages(current => current.filter(image => image !== url))}>Remove photo {index + 1}</button></div>)}
    {images.map((file, index) => <div key={`${file.name}-${index}`} className="flex justify-between text-sm"><span>{file.name}</span><button type="button" onClick={() => setImages(images.filter((_, i) => i !== index))}>Remove</button></div>)}
    <div className="flex items-center gap-4"><button disabled={busy || (privacy === 'selected' && !followers.data)} className="rounded-lg bg-gradient-to-r from-blue-600 to-teal-600 px-6 py-3 text-white disabled:opacity-50">{busy ? (post ? 'Saving...' : 'Publishing...') : (post ? 'Save changes' : 'Publish Post')}</button>{post && <Link href={`/post/${post.postId}`} className="text-sm text-slate-600">Cancel</Link>}</div>
  </form></div>;
}
