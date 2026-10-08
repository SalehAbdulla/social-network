'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type FollowLists, type Post, PRIVACY_LABEL, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import ImagePicker from './ImagePicker';
import { useResource } from '../lib/useResource';
import { clearPostDraft, draftHasContent, readPostDraft, writePostDraft } from '../lib/postDraft';

const MIN_CONTENT = 10;
const DRAFT_SAVE_DELAY = 400;

type Blocker = { message: string; field: 'content' | 'followers' };

export default function PostForm({ post }: { post?: Post }) {
  const { user } = useBackend();
  const router = useRouter();
  const isNewPost = !post;
  const [content, setContent] = useState(post?.content || '');
  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(post?.imageUrls || []);
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'selected'>(post?.privacy || 'public');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>(post?.selectedFollowerIds || []);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [published, setPublished] = useState(false);
  const contentField = useRef<HTMLTextAreaElement>(null);
  const followersField = useRef<HTMLFieldSetElement>(null);
  const followers = useResource<FollowLists>('/users/me/follows', privacy === 'selected');

  useEffect(() => {
    if (!isNewPost) return;
    const timer = window.setTimeout(() => {
      const draft = readPostDraft();
      if (draft) {
        setContent(draft.content);
        setPrivacy(draft.privacy);
        setSelectedFollowers(draft.selectedFollowerIds);
        setRestoredDraft(draftHasContent(draft.content));
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isNewPost]);

  useEffect(() => {
    if (!isNewPost || !hydrated || published) return;
    if (!draftHasContent(content)) { clearPostDraft(); return; }
    const timer = window.setTimeout(() => writePostDraft({ content, privacy, selectedFollowerIds: selectedFollowers, savedAt: Date.now() }), DRAFT_SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [isNewPost, hydrated, published, content, privacy, selectedFollowers]);

  const hasMedia = images.length > 0 || existingImages.length > 0;
  const audience = selectedFollowers.filter(id => followers.data?.followers.some(person => person.userId === id));

  function blockedReason(): Blocker | null {
    const trimmedContent = content.trim();
    if (!trimmedContent && !hasMedia) {
      return { message: 'Write something, or add a photo.', field: 'content' };
    }
    const missing = MIN_CONTENT - trimmedContent.length;
    if (!hasMedia && missing > 0) {
      return { message: `Add ${missing} more character${missing === 1 ? '' : 's'} (at least ${MIN_CONTENT}).`, field: 'content' };
    }
    if (privacy === 'selected') {
      if (!followers.data) {
        return { message: followers.loading ? 'Waiting for your follower list…' : 'Could not load your followers. Reload the page.', field: 'followers' };
      }
      if (!audience.length) return { message: 'Choose at least one follower.', field: 'followers' };
    }
    return null;
  }

  const blocker = blockedReason();

  async function publish() {
    if (busy) return;
    if (blocker) {
      toast.error(blocker.message);
      if (blocker.field === 'content') contentField.current?.focus();
      else followersField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const imageUrls = [...existingImages];
      for (const file of images) imageUrls.push((await upload(file)).url);
      await request(post ? `/posts/${post.postId}` : '/posts', post ? 'PUT' : 'POST', { title: '', content, imageUrls, privacy, selectedFollowerIds: privacy === 'selected' ? audience : [] });
      if (isNewPost) { clearPostDraft(); setPublished(true); }
      toast.success(post ? 'Post updated' : 'Post published');
      router.push(post ? `/post/${post.postId}` : '/');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  function discardDraft() {
    clearPostDraft();
    setContent(''); setPrivacy('public'); setSelectedFollowers([]);
    setRestoredDraft(false);
    contentField.current?.focus();
  }

  function shortcut(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    void publish();
  }
  return <div className="mx-auto max-w-6xl p-6 sm:p-8 space-y-6">
    <h1 className="text-3xl font-bold">Edit Post</h1>
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start"><form onSubmit={event => { event.preventDefault(); void publish(); }} onKeyDown={shortcut} noValidate className="rounded-xl bg-white p-6 shadow-sm space-y-5"><div className="flex items-center gap-3"><Avatar name={displayName(user)} avatarUrl={user.avatar} /><div><p className="font-medium">{displayName(user)}</p><p className="text-sm text-slate-500">@{user.nickname}</p></div></div>
    {restoredDraft && <p role="status" id="draft-restored" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">Draft restored. The text and the audience came back; photos did not.<button type="button" onClick={discardDraft} className="font-medium text-brand-1 underline">Discard draft</button></p>}
    <label className="block text-sm font-medium">Description<textarea ref={contentField} required={!hasMedia} minLength={hasMedia ? 0 : MIN_CONTENT} maxLength={500} rows={6} value={content} onChange={event => setContent(event.target.value)} aria-describedby={blocker ? 'publish-blocked' : undefined} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="Write a description…" /></label>
    <label className="block text-sm font-medium">Audience<select value={privacy} onChange={event => setPrivacy(event.target.value as typeof privacy)} className="mt-2 block w-full rounded-lg border border-slate-200 p-3">{Object.entries(PRIVACY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {privacy === 'selected' && <fieldset ref={followersField} tabIndex={-1} className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium">Choose followers</legend>
      {followers.loading && <p role="status" className="text-sm text-slate-500">Loading followers...</p>}
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
    <ImagePicker files={images} onChange={setImages} existing={existingImages} onRemoveExisting={url => setExistingImages(current => current.filter(image => image !== url))} disabled={busy} purpose="post" />
    <div className="sticky bottom-0 z-10 space-y-2 rounded-xl border border-border bg-white/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={busy} title="Save with Ctrl/Cmd + Enter" className="rounded-lg bg-gradient-to-r from-blue-600 to-teal-700 px-6 py-3 text-white disabled:opacity-50">{busy ? 'Saving...' : 'Save changes'}</button>
        {post && <Link href={`/post/${post.postId}`} className="text-sm text-slate-600">Cancel</Link>}
        <span aria-hidden="true" className="ml-auto hidden text-xs text-muted sm:inline">Ctrl/Cmd + Enter</span>
      </div>
      {blocker && <p id="publish-blocked" className="text-xs text-muted">{blocker.message}</p>}
    </div>
  </form></div></div>;
}
