'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, MoreVertical, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Story, displayName, errorMessage, request, upload } from '../api/social';
import { useDialogFocus } from '../lib/useDialogFocus';
import { usePagedList } from '../lib/usePagedList';
import { mediaImageProps } from '../lib/mediaVariants';
import { authorHasUnseen, firstUnseenIndex, findPosition, groupStories, startPosition, type StoryGroup } from '../lib/storySequence';
import { useBackend } from './BackendProvider';
import LoadMore from './LoadMore';
import StoryRing from './stories/StoryRing';
import StoryViewer from './stories/StoryViewer';

export function CreateStory({ close, saved }: { close: () => void; saved: () => void }) {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#4f46e5');
  const [media, setMedia] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
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
const STORIES_KEY = '/stories';
const ARCHIVE_KEY = '/stories/archive';
const lastUnseen = new Set<string>();

export default function StoriesBar() {
  const { user } = useBackend();
  const router = useRouter();
  const stories = usePagedList<Story, Story[]>({
    key: STORIES_KEY,
    pageQuery: page => `?offset=${(page - 1) * STORIES_PER_PAGE}`,
    pageSize: STORIES_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: story => story.storyId,
  });
  const strip = useRef<HTMLDivElement>(null);
  const [creating, setCreating] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
  const reload = stories.reload;
  useEffect(() => {
    const timer = setInterval(() => { if (!strip.current || strip.current.scrollLeft === 0) reload(); }, 60000);
    return () => clearInterval(timer);
  }, [reload]);

  const groups = groupStories(stories.items.filter(story => story.userId !== user.userId));
  const ordered = [
    ...groups.filter(group => authorHasUnseen(group.stories)),
    ...groups.filter(group => !authorHasUnseen(group.stories)),
  ];
  const ownStories = stories.items.filter(story => story.userId === user.userId).sort((a, b) => a.storyId - b.storyId);
  const ownHead = ownStories.length ? ownStories[ownStories.length - 1] : null;

  const unseenIds = groups.filter(group => authorHasUnseen(group.stories)).map(group => group.userId);
  const [fading, setFading] = useState<string[]>([]);
  useEffect(() => {
    if (!groups.length) return;
    const watched = groups.filter(group => !authorHasUnseen(group.stories) && lastUnseen.has(group.userId)).map(group => group.userId);
    lastUnseen.clear();
    for (const id of unseenIds) lastUnseen.add(id);
    if (watched.length) { const reveal = () => setFading(watched); reveal(); }
  }, [groups, unseenIds]);
  useEffect(() => {
    if (!fading.length) return;
    const clear = () => setFading([]);
    const frame = requestAnimationFrame(clear);
    return () => cancelAnimationFrame(frame);
  }, [fading]);
  const fadingSet = new Set(fading);

  function openGroup(group: StoryGroup<Story>) {
    const story = group.stories[firstUnseenIndex(group.stories)];
    router.push(`/stories/${story.nickname}/${story.storyId}`);
  }

  const syncEdges = useCallback(() => {
    const el = strip.current; if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => { syncEdges(); }, [syncEdges, stories.items.length]);
  useEffect(() => {
    const el = strip.current; if (!el) return;
    const observer = new ResizeObserver(syncEdges);
    observer.observe(el);
    window.addEventListener('resize', syncEdges);
    return () => { observer.disconnect(); window.removeEventListener('resize', syncEdges); };
  }, [syncEdges]);

  function nudge(direction: number) {
    const el = strip.current; if (!el) return;
    el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  }
  function onTrayKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowRight') { event.preventDefault(); nudge(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-1); }
  }
  function onDragStart(event: React.PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const el = strip.current; if (!el) return;
    drag.current = { active: true, startX: event.clientX, startLeft: el.scrollLeft, moved: false };
  }
  function onDragMove(event: React.PointerEvent) {
    const el = strip.current; const state = drag.current;
    if (!el || !state.active) return;
    const delta = event.clientX - state.startX;
    if (Math.abs(delta) > 4) state.moved = true;
    if (state.moved) el.scrollLeft = state.startLeft - delta;
  }
  function onDragEnd() { drag.current.active = false; }
  function onTrayClickCapture(event: React.MouseEvent) {
    if (drag.current.moved) { event.preventDefault(); event.stopPropagation(); drag.current.moved = false; }
  }

  return <section className="relative">
    <div
      ref={strip}
      tabIndex={0}
      role="group"
      aria-label="Stories"
      className="story-tray no-scrollbar flex select-none items-center gap-3 overflow-x-auto"
      onScroll={syncEdges}
      onKeyDown={onTrayKey}
      onPointerDown={onDragStart}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerLeave={onDragEnd}
      onClickCapture={onTrayClickCapture}
    >
      <div className="story-tray-item flex w-[var(--story-item)] shrink-0 flex-col items-center gap-[var(--story-caption-gap)]">
        <span className="relative flex shrink-0">
          <button type="button" onClick={() => (ownHead ? openGroup({ userId: user.userId, stories: ownStories }) : setCreating(true))} aria-label={ownHead ? `${displayName(user)}, your story` : 'Add to your story'} className="block">
            {ownHead
              ? <StoryRing name={displayName(user)} avatarUrl={user.avatar} size={56} seen own marker={false} />
              : <span className="flex size-[var(--story-ring)] items-center justify-center rounded-full border-2 border-dashed border-border bg-surface-2">
                  {user.avatar ? <img src={user.avatar} alt="" className="size-[var(--story-avatar)] rounded-full object-cover" /> : <span className="flex size-[var(--story-avatar)] items-center justify-center rounded-full bg-card text-lg font-semibold text-muted">{displayName(user).slice(0, 1).toUpperCase()}</span>}
                </span>}
          </button>
          <button type="button" onClick={() => setCreating(true)} aria-label="Add to your story" className="absolute -bottom-0.5 -right-0.5 flex size-[var(--story-badge)] items-center justify-center rounded-full border-2 border-bg bg-blue-600 text-white transition hover:brightness-110 active:scale-95"><Plus className="size-[var(--story-badge-icon)]" aria-hidden="true" /></button>
        </span>
        <button type="button" onClick={() => (ownHead ? openGroup({ userId: user.userId, stories: ownStories }) : setCreating(true))} className="story-tray-label w-full truncate text-center text-[length:var(--story-caption-size)] text-text">Your story</button>
      </div>
      {ordered.map(group => <StoryTrayItem key={group.userId} group={group} forceUnseen={fadingSet.has(group.userId)} onView={() => openGroup(group)} />)}
      <LoadMore compact className="h-[var(--story-ring)] w-16" label="Load more stories" endLabel={null} loading={stories.loadingMore} hasMore={stories.hasMore} onLoadMore={stories.loadMore} />
    </div>
    {edges.left && <button type="button" className="story-tray-nav" data-side="left" aria-label="Scroll stories left" onClick={() => nudge(-1)}><ChevronLeft aria-hidden="true" /></button>}
    {edges.right && <button type="button" className="story-tray-nav" data-side="right" aria-label="Scroll stories right" onClick={() => nudge(1)}><ChevronRight aria-hidden="true" /></button>}
    {creating && <CreateStory close={() => setCreating(false)} saved={reload} />}
  </section>;
}

function StoryTrayItem({ group, forceUnseen, onView }: { group: StoryGroup<Story>; forceUnseen: boolean; onView: () => void }) {
  const head = group.stories[group.stories.length - 1];
  const unseen = forceUnseen || authorHasUnseen(group.stories);
  return <button type="button" data-story-id={head.storyId} onClick={onView} aria-label={`${head.nickname}, ${unseen ? 'new story' : 'story viewed'}`} className="story-tray-item flex w-[var(--story-item)] shrink-0 flex-col items-center gap-[var(--story-caption-gap)]">
    <StoryRing name={head.nickname} avatarUrl={head.avatar} size={56} seen={!unseen} />
    <span className={`story-tray-label w-full truncate text-center text-[length:var(--story-caption-size)] ${unseen ? 'font-semibold text-text' : 'text-muted'}`}>{head.nickname}</span>
  </button>;
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
    <span className="absolute left-3 top-3 z-10"><StoryRing name={story.nickname} avatarUrl={story.avatar} size={34} seen={story.viewed} /></span>
    {story.mediaType === 'text' && <p className="absolute left-3 right-3 top-16 z-10 line-clamp-4 text-sm text-white/80">{story.content}</p>}
    <span className="absolute inset-x-0 bottom-0 z-10 truncate bg-black/40 p-2 text-xs">{story.nickname}</span>
    {story.userId === currentUserId && <div className="absolute right-2 top-2 z-20" onClick={event => event.stopPropagation()}><button aria-label="Story options" onClick={() => setMenuOpen(value => !value)} className="text-white"><MoreVertical size={18} /></button>{menuOpen && <button disabled={deleting} onClick={() => void remove()} className="absolute right-0 mt-1 flex items-center gap-1 rounded bg-white px-3 py-2 text-xs text-red-600 shadow"><Trash2 size={14} />Delete</button>}</div>}
  </div>;
}

export function StoryArchive({ close }: { close: () => void }) {
  const { user } = useBackend();
  const archived = usePagedList<Story, Story[]>({
    key: ARCHIVE_KEY,
    pageQuery: page => `?offset=${(page - 1) * STORIES_PER_PAGE}`,
    pageSize: STORIES_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: story => story.storyId,
  });
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useDialogFocus<HTMLDivElement>(close, { enabled: selected === null });
  const items = archived.items;
  async function remove(story: Story) {
    await request(`/stories/${story.storyId}`, 'DELETE');
    archived.update(list => list.filter(item => item.storyId !== story.storyId));
  }
  const groups: StoryGroup<Story>[] = items.length ? [{ userId: user.userId, stories: [...items].sort((a, b) => a.storyId - b.storyId) }] : [];
  const start = (selected !== null ? findPosition(groups, selected) : null) ?? startPosition(groups);
  if (selected !== null && start) return <StoryViewer
    groups={groups}
    start={start}
    onClose={() => setSelected(null)}
    onDelete={async storyId => { const story = items.find(item => item.storyId === storyId); if (story) await remove(story); setSelected(null); }} />;
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
          : <div className="flex flex-wrap gap-4">{archived.items.map(story => <StoryCard key={story.storyId} story={story} currentUserId={user.userId} onView={item => setSelected(item.storyId)} onDelete={() => remove(story)} />)}</div>}
      {archived.items.length > 0 && <LoadMore loading={archived.loadingMore} hasMore={archived.hasMore} onLoadMore={archived.loadMore} label="Load more archived stories" />}
    </div>
  </div>;
}
