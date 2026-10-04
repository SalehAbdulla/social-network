'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Eye } from 'lucide-react';
import { type FollowLists, type Post, PRIVACY_LABEL, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import ImagePicker from './ImagePicker';
import PostPreview from './PostPreview';
import { useResource } from '../lib/useResource';
import { clearPostDraft, draftHasContent, readPostDraft, writePostDraft } from '../lib/postDraft';

// The server is the authority on both lengths (ErrTitleLength, ErrContentLength);
// they are repeated here so the composer can refuse before the request and name the
// field that is short instead of leaving a dead button.
const MIN_TITLE = 3;
const MIN_CONTENT = 10;
// How long a keystroke waits before the draft reaches storage. Writing on every
// character would hit the store thousands of times for one paragraph; this is short
// enough that a refresh right after typing keeps the text.
const DRAFT_SAVE_DELAY = 400;

/** What stops a publish, in the reader's words, and the field they should look at. */
type Blocker = { message: string; field: 'title' | 'content' | 'followers' };

export default function PostForm({ post, variant = 'page', onPublished }: {
  post?: Post;
  /** `modal` drops the page chrome (the wide centred column) for the composer dialog. */
  variant?: 'page' | 'modal';
  /** Called after a successful publish, so a dialog can close itself. */
  onPublished?: () => void;
}) {
  const modal = variant === 'modal';
  const { user } = useBackend();
  const router = useRouter();
  const isNewPost = !post;
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(post?.imageUrls || []);
  const [privacy, setPrivacy] = useState<'public' | 'followers' | 'selected'>(post?.privacy || 'public');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>(post?.selectedFollowerIds || []);
  const [busy, setBusy] = useState(false);
  // The restore is a read after mount rather than during render, so the server and
  // the browser render the same empty composer and hydration cannot mismatch.
  // Saving waits for it, or the first render would write the empty state over the
  // draft it is about to restore.
  const [hydrated, setHydrated] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [published, setPublished] = useState(false);
  // Whether the live preview is shown on mobile; on `lg:` it is always beside the form.
  const [showPreview, setShowPreview] = useState(false);
  // Object URLs for the files just picked, so the preview can draw them before upload.
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const titleField = useRef<HTMLInputElement>(null);
  const contentField = useRef<HTMLTextAreaElement>(null);
  const followersField = useRef<HTMLFieldSetElement>(null);
  const followers = useResource<FollowLists>('/users/me/follows', privacy === 'selected');

  // Reading storage means touching the browser, so like ThemeProvider it is deferred
  // to a task rather than done during render: the server and the first client render
  // agree on an empty composer, and hydration cannot mismatch. Saving waits for
  // `hydrated`, because a save that ran first would overwrite the draft with the
  // empty state this effect is about to restore.
  useEffect(() => {
    if (!isNewPost) return;
    const timer = window.setTimeout(() => {
      const draft = readPostDraft();
      if (draft) {
        setTitle(draft.title);
        setContent(draft.content);
        setPrivacy(draft.privacy);
        setSelectedFollowers(draft.selectedFollowerIds);
        setRestoredDraft(draftHasContent(draft.title, draft.content));
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isNewPost]);

  useEffect(() => {
    if (!isNewPost || !hydrated || published) return;
    if (!draftHasContent(title, content)) { clearPostDraft(); return; }
    const timer = window.setTimeout(() => writePostDraft({ title, content, privacy, selectedFollowerIds: selectedFollowers, savedAt: Date.now() }), DRAFT_SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [isNewPost, hydrated, published, title, content, privacy, selectedFollowers]);

  // Object URLs follow the same create/revoke lifecycle as `ImagePicker.Preview`, so a
  // removed file does not leave a blob behind and the preview never draws a stale one.
  // The assignment is deferred a tick for the same reason `Preview` defers its `src`:
  // setting state synchronously inside an effect body is discouraged by the hooks rules.
  useEffect(() => {
    const urls = images.map(file => URL.createObjectURL(file));
    const timer = window.setTimeout(() => setFilePreviews(urls), 0);
    return () => { window.clearTimeout(timer); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [images]);

  const hasMedia = images.length > 0 || existingImages.length > 0;
  const audience = selectedFollowers.filter(id => followers.data?.followers.some(person => person.userId === id));
  // The chosen followers in their own words, for the preview's audience banner. It is
  // the same set `publish` sends, so the banner cannot name someone the post would not
  // actually reach — a restored draft can hold an id that has since been unfollowed.
  const audienceNames = (followers.data?.followers || []).filter(person => selectedFollowers.includes(person.userId)).map(person => displayName(person));

  /**
   * What stops this draft from being publishable, or null when nothing does.
   *
   * The order is the order the reader meets the fields in: the title and the text
   * first, then the audience, which lives further down the form.
   */
  function blockedReason(): Blocker | null {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle && trimmedTitle.length < MIN_TITLE) {
      return { message: `Titles need at least ${MIN_TITLE} characters.`, field: 'title' };
    }
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
      // A disabled button says nothing; this says what is missing and puts the
      // caret where the answer goes.
      toast.error(blocker.message);
      if (blocker.field === 'title') titleField.current?.focus();
      else if (blocker.field === 'content') contentField.current?.focus();
      else followersField.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const imageUrls = [...existingImages];
      for (const file of images) imageUrls.push((await upload(file)).url);
      await request(post ? `/posts/${post.postId}` : '/posts', post ? 'PUT' : 'POST', { title, content, imageUrls, privacy, selectedFollowerIds: privacy === 'selected' ? audience : [] });
      // The draft has become a post, so it must not come back on the next visit —
      // and storage must not be written again by the effect on the way out.
      if (isNewPost) { clearPostDraft(); setPublished(true); }
      toast.success(post ? 'Post updated' : 'Post published');
      // The same navigation the page has always done, then the dialog (if there is one) closes.
      router.push(post ? `/post/${post.postId}` : '/');
      onPublished?.();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  function discardDraft() {
    clearPostDraft();
    setTitle(''); setContent(''); setPrivacy('public'); setSelectedFollowers([]);
    setRestoredDraft(false);
    contentField.current?.focus();
  }

  // Ctrl/Cmd + Enter publishes from wherever the caret is, the textarea included,
  // where a bare Enter stays a newline.
  function shortcut(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    void publish();
  }
  return <div className={modal ? 'space-y-4' : 'mx-auto max-w-6xl p-6 sm:p-8 space-y-6'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      {!modal && <h1 className="text-3xl font-bold">{post ? 'Edit Post' : 'Create Post'}</h1>}
      <button type="button" onClick={() => setShowPreview(current => !current)} aria-expanded={showPreview} aria-controls="post-preview" className={`chat-secondary inline-flex items-center gap-2 ${modal ? '' : 'lg:hidden'}`}><Eye size={16} aria-hidden="true" />{showPreview ? 'Hide preview' : 'Preview'}</button>
    </div>
    {/* `noValidate` hands the checks to `publish()`, which explains itself; the
        fields keep `required`/`minLength` as a description for assistive technology
        rather than as the thing that decides. */}
    <div className={modal ? 'space-y-5' : 'lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start'}><form onSubmit={event => { event.preventDefault(); void publish(); }} onKeyDown={shortcut} noValidate className="rounded-xl bg-white p-6 shadow-sm space-y-5"><div className="flex items-center gap-3"><Avatar name={displayName(user)} avatarUrl={user.avatar} /><div><p className="font-medium">{displayName(user)}</p><p className="text-sm text-slate-500">@{user.nickname}</p></div></div>
    {restoredDraft && <p role="status" id="draft-restored" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">Draft restored. The text and the audience came back; photos did not.<button type="button" onClick={discardDraft} className="font-medium text-brand-1 underline">Discard draft</button></p>}
    <label className="block text-sm font-medium">Title (optional)<input ref={titleField} minLength={MIN_TITLE} maxLength={30} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="Give your post a title" /></label>
    <label className="block text-sm font-medium">Your post<textarea ref={contentField} required={!hasMedia} minLength={hasMedia ? 0 : MIN_CONTENT} maxLength={500} rows={6} value={content} onChange={event => setContent(event.target.value)} aria-describedby={blocker ? 'publish-blocked' : undefined} className="mt-2 w-full rounded-lg border border-slate-200 p-3" placeholder="What's happening?" /></label>
    <label className="block text-sm font-medium">Post privacy<select value={privacy} onChange={event => setPrivacy(event.target.value as typeof privacy)} className="mt-2 block w-full rounded-lg border border-slate-200 p-3">{Object.entries(PRIVACY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
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
    <ImagePicker files={images} onChange={setImages} existing={existingImages} onRemoveExisting={url => setExistingImages(current => current.filter(image => image !== url))} disabled={busy} />
    {/* Sticky, so the publish control stays reachable while a long post is written,
        and the same button as before rather than a second copy of it. */}
    <div className="sticky bottom-0 z-10 space-y-2 rounded-xl border border-border bg-white/95 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4">
        <button disabled={busy} title="Publish with Ctrl/Cmd + Enter" className="rounded-lg bg-gradient-to-r from-blue-600 to-teal-700 px-6 py-3 text-white disabled:opacity-50">{busy ? (post ? 'Saving...' : 'Publishing...') : (post ? 'Save changes' : 'Publish Post')}</button>
        {post && <Link href={`/post/${post.postId}`} className="text-sm text-slate-600">Cancel</Link>}
        <span aria-hidden="true" className="ml-auto hidden text-xs text-muted sm:inline">Ctrl/Cmd + Enter</span>
      </div>
      {blocker && <p id="publish-blocked" className="text-xs text-muted">{blocker.message}</p>}
    </div>
  </form><section id="post-preview" aria-label="Post preview" className={showPreview ? 'block' : (modal ? 'hidden' : 'hidden lg:block')}><p className="mb-3 text-sm font-medium text-muted">Preview</p><PostPreview user={user} title={title} content={content} privacy={privacy} imageUrls={[...existingImages, ...filePreviews]} createdAt={post?.createdAt} selectedNames={audienceNames} /></section></div></div>;
}
