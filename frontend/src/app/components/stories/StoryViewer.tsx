'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, MoreHorizontal, X } from 'lucide-react';
import { type Story, type StoryReply as ReplyEntry, type StoryViewer as ViewerEntry, errorMessage, reactToStory, request, shortAge } from '../../api/social';
import { mediaVariant } from '../../lib/mediaVariants';
import { useDialogFocus } from '../../lib/useDialogFocus';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useResource } from '../../lib/useResource';
import { useStoryPlayer } from '../../lib/useStoryPlayer';
import { authorHasUnseen, type Position, type StoryGroup } from '../../lib/storySequence';
import { useBackend } from '../BackendProvider';
import Menu, { MenuItem } from '../ui/Menu';
import Avatar from '../Avatar';
import StoryHeader from './StoryHeader';
import StoryFooter from './StoryFooter';
import StoryPreviewCard from './StoryPreviewCard';

/** A press longer than this is a hold (pause); anything shorter is a tap (navigate). */
const HOLD_MS = 200;

/**
 * Instagram's web story viewer: a near-black full-viewport overlay with a single 9:16 card
 * centred over it, the neighbour authors dimmed at its shoulders, and the author's stories
 * playing one after another across the whole listing.
 *
 * The behaviour lives in `useStoryPlayer`; this component is the shell — it lays the pieces
 * out, decides tap-versus-hold, and owns the parts that talk to the API (the heart, the
 * reply, the viewers list). It is a dialog: `useDialogFocus` traps focus, locks the page
 * scroll and closes on Escape, and returns focus to the tray item that opened it.
 */
export default function StoryViewer({ groups, start, onClose, onSeen, onDelete, onNavigate }: {
  groups: StoryGroup<Story>[];
  start: Position;
  onClose: () => void;
  onSeen?: (story: Story) => void;
  onDelete?: (storyId: number) => Promise<void>;
  /** Called as the current story changes, so the route can keep the URL in step. */
  onNavigate?: (story: Story) => void;
}) {
  const { user } = useBackend();
  const dialog = useDialogFocus<HTMLDivElement>(onClose);
  const wide = useMediaQuery('(min-width: 768px)');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const player = useStoryPlayer<Story>({ groups, start, onClose, onSeen, videoRef, fillRef });
  const { story, group, pos, paused, muted, hold, ready, failed } = player;
  const isOwn = !!story && story.userId === user.userId;

  // Keep the address bar on the story being watched: advancing replaces the URL rather than
  // pushing a new history entry, so Back leaves the viewer instead of stepping back a story.
  useEffect(() => { if (story) onNavigate?.(story); }, [story?.storyId, onNavigate]);

  // The heart is viewer-relative and per story; seeded from the story, updated optimistically
  // so the tap is instant, then put back if the write fails.
  // The heart and the reply draft belong to the story on screen, so both are keyed by its id:
  // when the story advances they simply read as fresh, with no effect to clear them (which
  // would also drop a half-typed reply mid-advance for no reason).
  const [like, setLike] = useState<{ id: number; liked: boolean; count: number } | null>(null);
  const liked = like && like.id === story?.storyId ? like.liked : (story?.liked ?? false);
  const likeCount = like && like.id === story?.storyId ? like.count : (story?.likeCount ?? 0);
  const [draft, setDraft] = useState<{ id: number; text: string } | null>(null);
  const reply = draft && draft.id === story?.storyId ? draft.text : '';
  const [sentFor, setSentFor] = useState<number | null>(null);
  const sent = sentFor === story?.storyId;
  const [sending, setSending] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const viewers = useResource<ViewerEntry[]>(`/stories/${story?.storyId ?? 0}/viewers`, isOwn && !!story);
  const [showReplies, setShowReplies] = useState(false);
  const replies = useResource<ReplyEntry[]>(`/stories/${story?.storyId ?? 0}/replies`, isOwn && !!story);

  const holdTimer = useRef<number | null>(null);
  const held = useRef(false);

  function toggleLike() {
    if (!story) return;
    const id = story.storyId;
    const nextLiked = !liked;
    const previous = { id, liked, count: likeCount };
    setLike({ id, liked: nextLiked, count: Math.max(0, likeCount + (nextLiked ? 1 : -1)) });
    reactToStory(id, nextLiked).catch(() => setLike(previous));
  }

  async function sendReply() {
    const content = reply.trim();
    if (!content || !story || sending) return;
    setSending(true);
    try {
      await request(`/stories/${story.storyId}/reply`, 'POST', { content });
      const id = story.storyId;
      setDraft({ id, text: '' });
      setSentFor(id);
      window.setTimeout(() => setSentFor(current => (current === id ? null : current)), 1500);
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSending(false); }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); toast.success('Link copied'); }
    catch { toast.error('Could not copy link'); }
  }

  async function remove() {
    if (!story || !onDelete) return;
    try { await onDelete(story.storyId); } catch (error) { toast.error(errorMessage(error)); }
  }

  function pressStart() {
    held.current = false;
    holdTimer.current = window.setTimeout(() => { held.current = true; player.setHold(true); }, HOLD_MS);
  }
  function pressEnd(clientX: number, element: HTMLElement) {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (held.current) { held.current = false; player.setHold(false); return; }
    const rect = element.getBoundingClientRect();
    if (clientX - rect.left < rect.width / 3) player.prev(); else player.next();
  }
  function pressCancel() {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (held.current) { held.current = false; player.setHold(false); }
  }

  if (!story || !group) return null;

  const menu = <Menu label="Story options" triggerIcon={MoreHorizontal} align="end" className="story-menu">
    <MenuItem onClick={() => void copyLink()}>Copy link</MenuItem>
    {story.mediaType === 'video' && <MenuItem onClick={player.toggleMute}>{muted ? 'Unmute' : 'Mute'}</MenuItem>}
    <MenuItem onClick={() => toast('Reporting a problem is not wired up yet.')}>Report</MenuItem>
    {isOwn && onDelete && <MenuItem onClick={() => void remove()}>Delete story</MenuItem>}
  </Menu>;

  const prevGroup = groups[pos.user - 1] ?? null;
  const nextGroup = groups[pos.user + 1] ?? null;
  const prevFar = groups[pos.user - 2] ?? null;
  const nextFar = groups[pos.user + 2] ?? null;

  return <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Story" className="story-overlay">
    <div className="story-topbar">
      <img src="/logo.svg" alt="Social Network" className="story-logo" />
      <button type="button" className="story-close" aria-label="Close story" onClick={onClose}><X aria-hidden="true" /></button>
    </div>

    <div className="story-stage">
      {wide && prevFar && <div className="story-neighbor" data-tier="2" data-side="left">
        <StoryPreviewCard story={prevFar.stories[prevFar.stories.length - 1]} side="left" unseen={authorHasUnseen(prevFar.stories)} onClick={() => player.goToUser(pos.user - 2)} />
      </div>}
      {wide && prevGroup && <div className="story-neighbor" data-side="left">
        <StoryPreviewCard story={prevGroup.stories[prevGroup.stories.length - 1]} side="left" unseen={authorHasUnseen(prevGroup.stories)} onClick={() => player.goToUser(pos.user - 1)} />
      </div>}
      {wide && nextGroup && <div className="story-neighbor" data-side="right">
        <StoryPreviewCard story={nextGroup.stories[nextGroup.stories.length - 1]} side="right" unseen={authorHasUnseen(nextGroup.stories)} onClick={() => player.goToUser(pos.user + 1)} />
      </div>}
      {wide && nextFar && <div className="story-neighbor" data-tier="2" data-side="right">
        <StoryPreviewCard story={nextFar.stories[nextFar.stories.length - 1]} side="right" unseen={authorHasUnseen(nextFar.stories)} onClick={() => player.goToUser(pos.user + 2)} />
      </div>}

      <div className="story-card" data-holding={hold} data-wide={wide}>
        <StoryHeader
          story={story}
          count={group.stories.length}
          current={pos.story}
          fillRef={fillRef}
          paused={paused}
          muted={muted}
          onTogglePause={player.togglePause}
          onToggleMute={player.toggleMute}
          menu={menu}
        />

        <div
          className="story-media"
          onPointerDown={pressStart}
          onPointerUp={event => pressEnd(event.clientX, event.currentTarget)}
          onPointerLeave={pressCancel}
          onPointerCancel={pressCancel}
        >
          {story.mediaType === 'text' && <p className="story-text" style={{ backgroundColor: story.backgroundColor }} dir="auto">{story.content}</p>}
          {story.mediaType === 'image' && <>
            <img className="story-media-bg" src={mediaVariant(story.mediaUrl, 'thumb')} alt="" aria-hidden="true" />
            <img className="story-media-fg" src={mediaVariant(story.mediaUrl, 'large')} alt="Story" onLoad={player.onMediaReady} onError={player.onMediaError} />
          </>}
          {story.mediaType === 'video' && <video ref={videoRef} className="story-media-fg story-media-video" src={story.mediaUrl} playsInline onLoadedData={player.onMediaReady} onError={player.onMediaError} />}
          {!ready && !failed && <span className="story-spinner" role="status" aria-label="Loading story"><span /></span>}
          {failed && <p className="story-fail" role="alert">This media could not be played.</p>}
        </div>

        <StoryFooter
          isOwn={isOwn}
          nickname={story.nickname}
          viewerCount={viewers.data?.length ?? 0}
          replyCount={replies.data?.length ?? 0}
          onOpenViewers={() => setShowViewers(true)}
          onOpenReplies={() => setShowReplies(true)}
          liked={liked}
          likeCount={likeCount}
          onToggleLike={toggleLike}
          reply={reply}
          onReplyChange={value => setDraft({ id: story.storyId, text: value })}
          onReplyFocus={() => player.setFocused(true)}
          onReplyBlur={() => player.setFocused(false)}
          onSendReply={() => void sendReply()}
          sending={sending}
          sent={sent}
        />
      </div>

      {wide && pos.user > 0 && <button type="button" className="story-arrow" data-side="left" onClick={() => player.goToUser(pos.user - 1)} aria-label="Previous account's story"><ChevronLeft aria-hidden="true" /></button>}
      {wide && pos.user < groups.length - 1 && <button type="button" className="story-arrow" data-side="right" onClick={() => player.goToUser(pos.user + 1)} aria-label="Next account's story"><ChevronRight aria-hidden="true" /></button>}
    </div>

    {showViewers && isOwn && <ViewersPanel data={viewers.data} loading={viewers.loading} onClose={() => setShowViewers(false)} />}
    {showReplies && isOwn && <RepliesPanel data={replies.data} loading={replies.loading} onClose={() => setShowReplies(false)} />}
  </div>;
}

/** The author-only "seen by" list, shown over the viewer when the footer's control is used. */
function ViewersPanel({ data, loading, onClose }: { data: ViewerEntry[] | null; loading: boolean; onClose: () => void }) {
  return <div className="story-viewers-scrim" onClick={onClose}>
    <div className="story-viewers" role="dialog" aria-label="Story viewers" onClick={event => event.stopPropagation()}>
      <div className="story-viewers-head">
        <h2>Viewers</h2>
        <button type="button" onClick={onClose} aria-label="Close viewers"><X aria-hidden="true" /></button>
      </div>
      <div className="story-viewers-body">
        {loading && <p className="story-viewers-empty" role="status">Loading…</p>}
        {!loading && !data?.length && <p className="story-viewers-empty">No views yet.</p>}
        {(data ?? []).map(viewer => <div key={viewer.userId} className="story-viewer-row">
          <Avatar name={viewer.nickname} avatarUrl={viewer.avatar} size={36} />
          <span className="story-viewer-name">{viewer.nickname}</span>
          <time className="story-viewer-age" dateTime={viewer.viewedAt}>{shortAge(viewer.viewedAt)}</time>
        </div>)}
      </div>
    </div>
  </div>;
}

/** The author-only replies list, the sibling of the viewers panel. */
function RepliesPanel({ data, loading, onClose }: { data: ReplyEntry[] | null; loading: boolean; onClose: () => void }) {
  return <div className="story-viewers-scrim" onClick={onClose}>
    <div className="story-viewers" role="dialog" aria-label="Story replies" onClick={event => event.stopPropagation()}>
      <div className="story-viewers-head">
        <h2>Replies</h2>
        <button type="button" onClick={onClose} aria-label="Close replies"><X aria-hidden="true" /></button>
      </div>
      <div className="story-viewers-body">
        {loading && <p className="story-viewers-empty" role="status">Loading…</p>}
        {!loading && !data?.length && <p className="story-viewers-empty">No replies yet.</p>}
        {(data ?? []).map(reply => <div key={reply.replyId} className="story-viewer-row">
          <Avatar name={reply.nickname} avatarUrl={reply.avatar} size={36} />
          <span className="story-viewer-name">{reply.nickname}</span>
          <span className="story-viewer-text">{reply.content}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

