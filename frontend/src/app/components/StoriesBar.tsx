'use client';
import { useEffect, useRef, useState } from 'react';
import { Archive, ChevronLeft, ChevronRight, Eye, MessageCircle, MoreVertical, Plus, Send, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Story, type StoryReply as StoryReplyEntry, type StoryViewer as StoryViewerEntry, errorMessage, request, upload } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { mediaImageProps } from '../lib/mediaVariants';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import LoadMore from './LoadMore';

export function CreateStory({ close, saved }: { close: () => void; saved: () => void }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#4f46e5');
  const [media, setMedia] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The drawer's keyboard contract, applied to the composer: focus starts in the
  // text field, Escape closes, and Tab stays inside the dialog.
  const firstField = useRef<HTMLTextAreaElement>(null);
  const dialog = useDialogFocus<HTMLDivElement>(close, { initialFocus: firstField });
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.preview); }, [media]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const attachment = media ? await upload(media.file) : null;
      await request('/stories', 'POST', { content: text, backgroundColor: color, mediaUrl: attachment?.url || '', mediaType: attachment?.mediaType || 'text' });
      saved(); close(); toast.success('Story shared for 24 hours');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div ref={dialog} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Create story"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5"><div className="flex justify-between"><h2 className="text-xl font-bold">Create story</h2><button type="button" onClick={close} aria-label="Close story composer">Close</button></div>
    <div className="flex h-72 items-center justify-center overflow-hidden rounded-lg p-3" style={{ backgroundColor: color }}>{media ? media.file.type.startsWith('video/') ? <video src={media.preview} controls className="max-h-full" /> : <img src={media.preview} alt="Story preview" className="max-h-full object-contain" /> : <textarea ref={firstField} required={!media} maxLength={1000} value={text} onChange={event => setText(event.target.value)} placeholder="Share a moment?" className="h-full w-full resize-none bg-transparent p-3 text-xl text-white placeholder:text-white/70 outline-none" />}</div>
    <label className="flex items-center gap-3 text-sm">Background<input type="color" value={color} onChange={event => setColor(event.target.value)} /></label>
    <label className="block text-sm">Photo or video<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" onChange={event => { const file = event.target.files?.[0]; setMedia(file ? { file, preview: URL.createObjectURL(file) } : null); }} className="mt-2 block w-full" /></label>
    {media && <button type="button" onClick={() => setMedia(null)} className="text-sm text-blue-600">Use text instead</button>}
    <button disabled={busy} className="w-full rounded-lg bg-blue-600 py-3 text-white disabled:opacity-50">{busy ? 'Sharing?' : 'Share story'}</button>
  </form></div>;
}
const STORIES_PER_PAGE = 30;
// `/stories` caps a page at 30 rows and pages with a raw offset.
const STORIES_KEY = '/stories';
// The author's own expired stories: the same page size and offset shape, a different list.
const ARCHIVE_KEY = '/stories/archive';

export default function StoriesBar() {
  const { user } = useBackend();
  const stories = usePagedList<Story, Story[]>({
    key: STORIES_KEY,
    pageQuery: page => `?offset=${(page - 1) * STORIES_PER_PAGE}`,
    pageSize: STORIES_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: story => story.storyId,
  });
  const strip = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [viewing, setViewing] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);
  const reload = stories.reload;
  // Opening a story is also the moment it stops being new: the ring turns immediately,
  // because a round trip should not decide whether a ring the reader just opened stays lit.
  // The write is best-effort — a mark that fails falls back to a reload, which puts the
  // ring back where the server says it belongs rather than leaving a lie on screen.
  function markViewed(storyId: number) {
    stories.update(list => list.map(story => (story.storyId === storyId ? { ...story, viewed: true } : story)));
    void request(`/stories/${storyId}/view`, 'POST').catch(() => reload());
  }
  function viewStory(story: Story) {
    setViewing(story);
    if (!story.viewed) markViewed(story.storyId);
  }
  function showNextStory() {
    const items = stories.items;
    const index = viewing ? items.findIndex(story => story.storyId === viewing.storyId) : -1;
    if (index < 0) return;
    // Running off the end of the loaded strip asks for the next page instead of
    // closing the viewer, so a long story row can be watched end to end. A story the
    // viewer advances into is being displayed, so it is marked seen the same way.
    if (index < items.length - 1) viewStory(items[index + 1]);
    else stories.loadMore();
  }
  function showPreviousStory() {
    const items = stories.items;
    const index = viewing ? items.findIndex(story => story.storyId === viewing.storyId) : -1;
    if (index > 0) setViewing(items[index - 1]);
  }
  // A background refresh would collapse the pages the reader scrolled through,
  // so it only runs while the strip still shows the newest stories.
  useEffect(() => {
    const timer = setInterval(() => { if (!strip.current || strip.current.scrollLeft === 0) reload(); }, 60000);
    return () => clearInterval(timer);
  }, [reload]);
  return <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-900">Stories</h2><button type="button" onClick={() => setArchiveOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 transition hover:text-slate-900"><Archive size={14} aria-hidden="true" />Your archive</button></div><div ref={strip} className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
    <button onClick={() => setCreating(true)} className="flex aspect-[3/4] h-40 min-w-30 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-blue-200 bg-linear-to-b from-blue-50 to-white text-sm text-slate-700 shadow-sm transition hover:shadow-md"><span className="mb-3 flex size-10 items-center justify-center rounded-full bg-blue-600 text-white"><Plus size={20} /></span><span className="font-medium">Create story</span></button>
    {stories.items.map(story => <StoryCard key={story.storyId} story={story} currentUserId={user.userId} onView={viewStory} onDelete={async () => { await request(`/stories/${story.storyId}`, 'DELETE'); reload(); if (viewing?.storyId === story.storyId) setViewing(null); }} />)}
    <LoadMore compact className="h-40 w-24" label="Load more stories" endLabel={null} loading={stories.loadingMore} hasMore={stories.hasMore} onLoadMore={stories.loadMore} />
  </div>
    {creating && <CreateStory close={() => setCreating(false)} saved={reload} />}
    {archiveOpen && <StoryArchive close={() => setArchiveOpen(false)} />}
    {viewing && <StoryViewer key={viewing.storyId} story={viewing} canDelete={viewing.userId === user.userId} close={() => setViewing(null)} onPrevious={showPreviousStory} onNext={showNextStory} hasPrevious={stories.items.findIndex(story => story.storyId === viewing.storyId) > 0} hasNext={stories.items.findIndex(story => story.storyId === viewing.storyId) < stories.items.length - 1 || stories.hasMore} deleting={deleting} onDelete={async () => { setDeleting(true); try { await request(`/stories/${viewing.storyId}`, 'DELETE'); setViewing(null); reload(); } catch (error) { toast.error(errorMessage(error)); } finally { setDeleting(false); } }} />}
  </section>;
}

function StoryCard({ story, currentUserId, onView, onDelete }: { story: Story; currentUserId: string; onView: (story: Story) => void; onDelete: () => Promise<void> }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    setDeleting(true);
    try { await onDelete(); toast.success('Story deleted'); } catch (error) { toast.error(errorMessage(error)); } finally { setDeleting(false); setMenuOpen(false); }
  }
  return <div onClick={() => onView(story)} className="relative aspect-[3/4] h-40 min-w-30 shrink-0 cursor-pointer overflow-hidden rounded-lg bg-linear-to-b from-blue-600 to-teal-700 text-white shadow transition hover:shadow-lg active:scale-95" style={{ backgroundColor: story.backgroundColor }}>
    {story.mediaType === 'image' && <img {...mediaImageProps(story.mediaUrl, '180px')} alt="Story preview" className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-500 hover:scale-110" />}
    {story.mediaType === 'video' && <video src={story.mediaUrl} muted className="absolute inset-0 h-full w-full object-cover opacity-75" />}
    <div className="absolute inset-0 bg-black/15" />
    {/* The author avatar wears the seen/unseen ring. `data-story-ring` carries the state
        the ring is drawn from, which is also what the browser suite reads — the way it
        reads `data-message-actions` — because a gradient has no text to assert on. The
        ring keeps the avatar's old drop shadow, and the avatar a white collar, so both the
        ring and the face stay readable over any story's background colour. */}
    <span data-story-ring={story.viewed ? 'seen' : 'unseen'} className={`absolute left-3 top-3 z-10 flex rounded-full p-[2px] shadow ${story.viewed ? 'story-ring-seen' : 'story-ring'}`}>
      {story.avatar ? <img src={story.avatar} alt="" className="size-8 rounded-full border-2 border-white object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-white/25 text-xs font-semibold">{story.nickname.slice(0, 1).toUpperCase()}</span>}
    </span>
    {story.mediaType === 'text' && <p className="absolute left-3 right-3 top-16 z-10 line-clamp-4 text-sm text-white/80">{story.content}</p>}
    <span className="absolute inset-x-0 bottom-0 z-10 truncate bg-black/40 p-2 text-xs">@{story.nickname}</span>
    {story.userId === currentUserId && <div className="absolute right-2 top-2 z-20" onClick={event => event.stopPropagation()}><button aria-label="Story options" onClick={() => setMenuOpen(value => !value)} className="text-white"><MoreVertical size={18} /></button>{menuOpen && <button disabled={deleting} onClick={() => void remove()} className="absolute right-0 mt-1 flex items-center gap-1 rounded bg-white px-3 py-2 text-xs text-red-600 shadow"><Trash2 size={14} />Delete</button>}</div>}
  </div>;
}

function StoryViewer({ story, canDelete, close, onPrevious, onNext, hasPrevious, hasNext, deleting, onDelete }: { story: Story; canDelete: boolean; close: () => void; onPrevious: () => void; onNext: () => void; hasPrevious: boolean; hasNext: boolean; deleting: boolean; onDelete: () => Promise<void> }) {
  const [progress, setProgress] = useState(0);
  // The viewer is a dialog too: Escape closes it and the tab cycle is its own.
  const dialog = useDialogFocus<HTMLDivElement>(close);
  // "Seen by" belongs to the author alone, so the list is fetched only for them — the endpoint
  // enforces the same rule, and not asking is the cheaper half of it.
  const { user } = useBackend();
  const isAuthor = story.userId === user.userId;
  const [showViewers, setShowViewers] = useState(false);
  const viewers = useResource<StoryViewerEntry[]>(`/stories/${story.storyId}/viewers`, isAuthor);
  // Replies belong to the author alone too, the same shape as "seen by": the list is fetched
  // only for them, and the endpoint enforces the same rule. A reader is offered the reply box
  // instead — the other half of the same surface.
  const [showReplies, setShowReplies] = useState(false);
  const replies = useResource<StoryReplyEntry[]>(`/stories/${story.storyId}/replies`, isAuthor);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  async function sendReply(event: React.FormEvent) {
    event.preventDefault();
    const content = reply.trim();
    if (!content || sending) return;
    setSending(true);
    try { await request(`/stories/${story.storyId}/reply`, 'POST', { content }); setReply(''); toast.success('Reply sent'); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setSending(false); }
  }
  useEffect(() => {
    if (story.mediaType === 'video') return;
    const interval = window.setInterval(() => setProgress(value => Math.min(value + 1, 100)), 100);
    const timeout = window.setTimeout(onNext, 10000);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [story, onNext]);
  return <div ref={dialog} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Story"><div className="absolute left-0 top-0 h-1 bg-white transition-all" style={{ width: `${progress}%` }} /><div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded bg-black/50 p-3 text-white"><span className="font-medium">@{story.nickname}</span></div><button onClick={close} aria-label="Close story" className="absolute right-4 top-4 z-10 text-white"><X size={30} /></button><button onClick={onPrevious} disabled={!hasPrevious} aria-label="Previous story" className="absolute left-4 z-10 rounded-full bg-black/50 p-3 text-white transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft size={28} /></button><button onClick={onNext} disabled={!hasNext} aria-label="Next story" className="absolute right-4 z-10 rounded-full bg-black/50 p-3 text-white transition hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight size={28} /></button><div className="flex h-[75vh] w-full max-w-2xl items-center justify-center overflow-hidden rounded-xl" style={{ backgroundColor: story.backgroundColor }}>{story.mediaType === 'image' ? <img src={story.mediaUrl} alt="Story" className="max-h-full max-w-full object-contain" /> : story.mediaType === 'video' ? <video src={story.mediaUrl} controls autoPlay playsInline onEnded={onNext} className="max-h-full max-w-full" /> : <p className="whitespace-pre-wrap break-words p-8 text-center text-2xl text-white">{story.content}</p>}</div>{isAuthor && <div className="absolute bottom-8 right-8 z-10 flex flex-col items-end gap-2">
      {showReplies && <div className="max-h-64 w-72 overflow-y-auto rounded-lg bg-white p-2 text-slate-800 shadow-lg">
        {replies.loading && <p className="p-2 text-sm text-slate-500">Loading…</p>}
        {!replies.loading && !replies.data?.length && <p className="p-2 text-sm text-slate-500">No replies yet.</p>}
        {(replies.data || []).map(entry => <div key={entry.replyId} className="flex items-start gap-2 rounded p-2 hover:bg-slate-50"><Avatar name={entry.nickname} avatarUrl={entry.avatar} size={28} /><div className="min-w-0"><p className="truncate text-xs text-slate-500">@{entry.nickname}</p><p className="break-words text-sm">{entry.content}</p></div></div>)}
      </div>}
      {showViewers && <div className="max-h-64 w-64 overflow-y-auto rounded-lg bg-white p-2 text-slate-800 shadow-lg">
        {viewers.loading && <p className="p-2 text-sm text-slate-500">Loading…</p>}
        {!viewers.loading && !viewers.data?.length && <p className="p-2 text-sm text-slate-500">No views yet.</p>}
        {(viewers.data || []).map(viewer => <div key={viewer.userId} className="flex items-center gap-2 rounded p-2 hover:bg-slate-50"><Avatar name={viewer.nickname} avatarUrl={viewer.avatar} size={28} /><span className="min-w-0 truncate text-sm">@{viewer.nickname}</span></div>)}
      </div>}
      <div className="flex gap-2">
        <button type="button" aria-expanded={showReplies} onClick={() => setShowReplies(value => !value)} className="flex items-center gap-2 rounded bg-black/50 px-4 py-2 text-sm text-white transition hover:bg-black/70"><MessageCircle size={16} aria-hidden="true" />Replies {replies.data?.length ?? 0}</button>
        <button type="button" aria-expanded={showViewers} onClick={() => setShowViewers(value => !value)} className="flex items-center gap-2 rounded bg-black/50 px-4 py-2 text-sm text-white transition hover:bg-black/70"><Eye size={16} aria-hidden="true" />Seen by {viewers.data?.length ?? 0}</button>
      </div>
    </div>}{!isAuthor && <form onSubmit={sendReply} className="absolute bottom-8 left-1/2 z-10 flex w-[min(90%,28rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 p-1 pl-4">
      <input value={reply} onChange={event => setReply(event.target.value)} maxLength={1000} placeholder="Reply to this story…" aria-label="Reply to story" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-white placeholder:text-white/70 outline-none" />
      <button type="submit" disabled={sending || !reply.trim()} aria-label="Send reply" className="rounded-full bg-white p-2 text-slate-900 disabled:opacity-40"><Send size={16} /></button>
    </form>}{canDelete && <button disabled={deleting} onClick={() => void onDelete()} className="absolute bottom-8 flex items-center gap-2 rounded bg-white px-4 py-2 text-sm text-red-600"><Trash2 size={16} />{deleting ? 'Deleting...' : 'Delete story'}</button>}</div>;
}

// The author's own expired stories — the ones that have left the strip and would otherwise
// disappear. It is the caller's own list by construction (the endpoint answers only the signed-in
// account's stories), so there is nothing to filter or guard here.
function StoryArchive({ close }: { close: () => void }) {
  const { user } = useBackend();
  const archived = usePagedList<Story, Story[]>({
    key: ARCHIVE_KEY,
    pageQuery: page => `?offset=${(page - 1) * STORIES_PER_PAGE}`,
    pageSize: STORIES_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: story => story.storyId,
  });
  const [viewing, setViewing] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);
  // One overlay at a time: while a story is open the viewer owns the keyboard, so this dialog's
  // trap is off and Escape closes the story rather than the archive behind it.
  const dialog = useDialogFocus<HTMLDivElement>(close, { enabled: !viewing });
  const items = archived.items;
  const index = viewing ? items.findIndex(story => story.storyId === viewing.storyId) : -1;
  async function remove(story: Story) {
    setDeleting(true);
    try {
      await request(`/stories/${story.storyId}`, 'DELETE');
      if (viewing?.storyId === story.storyId) setViewing(null);
      archived.update(list => list.filter(item => item.storyId !== story.storyId));
    } finally { setDeleting(false); }
  }
  if (viewing) return <StoryViewer key={viewing.storyId} story={viewing} canDelete close={() => setViewing(null)}
    onPrevious={() => { if (index > 0) setViewing(items[index - 1]); }}
    onNext={() => { if (index >= 0 && index < items.length - 1) setViewing(items[index + 1]); else void archived.loadMore(); }}
    hasPrevious={index > 0} hasNext={index >= 0 && (index < items.length - 1 || archived.hasMore)}
    deleting={deleting}
    onDelete={async () => { try { await remove(viewing); } catch (error) { toast.error(errorMessage(error)); } }} />;
  return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Story archive" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
    <div className="my-8 w-full max-w-3xl space-y-4 rounded-xl bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Your story archive</h2>
          <p className="text-sm text-slate-500">Stories you have shared, after they leave the strip.</p>
        </div>
        <button type="button" onClick={close} className="chat-secondary shrink-0">Close</button>
      </div>
      {archived.loading
        ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading your archive…</p>
        : archived.items.length === 0
          ? <p className="py-8 text-center text-sm text-slate-500">No archived stories yet. A story arrives here once its 24 hours are up.</p>
          : <div className="flex flex-wrap gap-4">{archived.items.map(story => <StoryCard key={story.storyId} story={story} currentUserId={user.userId} onView={setViewing} onDelete={() => remove(story)} />)}</div>}
      {archived.items.length > 0 && <LoadMore loading={archived.loadingMore} hasMore={archived.hasMore} onLoadMore={archived.loadMore} label="Load more archived stories" />}
    </div>
  </div>;
}
