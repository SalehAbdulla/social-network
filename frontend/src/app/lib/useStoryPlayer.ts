'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { mediaVariant } from './mediaVariants';
import {
  firstUnseenIndex,
  nextPosition,
  prevPosition,
  storyAt,
  type Position,
  type SequencedStory,
  type StoryGroup,
} from './storySequence';

/** How long a still (or a text card) is shown before it advances. Instagram's five seconds. */
const IMAGE_MS = 5000;
/** A video longer than a minute is cut off there, the way the stories product caps it. */
const MAX_VIDEO_MS = 60000;
/** How long media-failure feedback shows before the viewer skips on. */
const ERROR_SKIP_MS = 1500;
/** The mute choice is remembered across openings for the life of the tab. */
let sessionMuted = true;

/** A story that, beyond its identity, knows how it plays. */
export interface PlayerStory extends SequencedStory {
  mediaType: 'text' | 'image' | 'video';
  mediaUrl: string;
}

export interface StoryPlayerOptions<T extends PlayerStory> {
  groups: StoryGroup<T>[];
  /** Where to open. Computed by the caller from the deep link or the tapped tray item. */
  start: Position;
  /** Called when playback runs off the end of the last story. */
  onClose: () => void;
  /** Called each time a story becomes the current one, so the caller can record a view. */
  onSeen?: (story: T) => void;
  /** The media elements the hook drives. The caller owns them so it can attach them in JSX. */
  videoRef: RefObject<HTMLVideoElement | null>;
  fillRef: RefObject<HTMLSpanElement | null>;
}

/**
 * The timing and playback brain of the story viewer, kept apart from its markup.
 *
 * It owns the position in the carousel, the play/pause/hold state, the mute preference and
 * the progress clock. The clock is a single `requestAnimationFrame` loop that writes the
 * current segment's fill through a ref — `scaleX` on the DOM, never a `setState` per frame —
 * so a 60fps bar cannot make React re-render the viewer sixty times a second. The loop only
 * accumulates time while `playing` is true, so a hold, a pause, a hidden tab or a focused
 * reply box freezes it exactly.
 */
export function useStoryPlayer<T extends PlayerStory>({ groups, start, onClose, onSeen, videoRef, fillRef }: StoryPlayerOptions<T>) {
  const [pos, setPos] = useState<Position>(start);
  const [resetToken, setResetToken] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const [muted, setMuted] = useState(sessionMuted);
  const [hidden, setHidden] = useState(false);
  const [focused, setFocused] = useState(false);

  const story = storyAt(groups, pos);
  const group = groups[pos.user] ?? null;

  // `ready` and `failed` belong to a specific story, so they are keyed by its id: the media
  // element's events set them for the story on screen, and a change of story reads the default
  // (ready for a text card, not-ready otherwise) without an effect having to reset them.
  const [media, setMedia] = useState<{ id: number; ready: boolean; failed: boolean }>({ id: 0, ready: false, failed: false });
  const storyId = story?.storyId ?? 0;
  const ready = media.id === storyId ? media.ready : story?.mediaType === 'text';
  const failed = media.id === storyId ? media.failed : false;

  const progress = useRef(0);
  const elapsed = useRef(0);
  const lastFrame = useRef(0);
  const frame = useRef<number | null>(null);
  const advancing = useRef(false);

  const playing = ready && !paused && !hold && !hidden && !focused;

  const next = useCallback(() => {
    if (advancing.current) return;
    const target = nextPosition(groups, pos);
    // Past the last story: close once. The guard is set before the close as well, so the rAF
    // loop — still running until the overlay unmounts — cannot fire `onClose` every frame.
    if (!target) { advancing.current = true; onClose(); return; }
    advancing.current = true;
    setPos(target);
  }, [groups, pos, onClose]);

  const prev = useCallback(() => {
    const target = prevPosition(groups, pos);
    // At the very first story `prevPosition` returns the same spot; setting the same state
    // would not re-run the reset effect, so a token forces the current story to replay.
    if (target.user === pos.user && target.story === pos.story) { setResetToken(value => value + 1); return; }
    setPos(target);
  }, [groups, pos]);

  const goToUser = useCallback((user: number) => {
    const target = groups[user];
    if (target) setPos({ user, story: firstUnseenIndex(target.stories) });
  }, [groups]);

  const togglePause = useCallback(() => setPaused(value => !value), []);
  const toggleMute = useCallback(() => setMuted(value => { sessionMuted = !value; return !value; }), []);

  // The rAF loop reads the latest callbacks through refs so it never needs re-creating.
  const nextRef = useRef(next);
  const playingRef = useRef(playing);
  const storyRef = useRef(story);
  useEffect(() => { nextRef.current = next; playingRef.current = playing; storyRef.current = story; });

  useEffect(() => {
    advancing.current = false;
    elapsed.current = 0;
    progress.current = 0;
    lastFrame.current = 0;
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
    const current = storyAt(groups, pos);
    if (current) onSeen?.(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, resetToken, groups]);

  // --- The clock: one loop, writing the bar's transform, no per-frame state --
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastFrame.current ? now - lastFrame.current : 0;
      lastFrame.current = now;
      const current = storyRef.current;
      const video = videoRef.current;
      let ratio = progress.current;
      if (current?.mediaType === 'video' && video && Number.isFinite(video.duration) && video.duration > 0) {
        const duration = Math.min(video.duration * 1000, MAX_VIDEO_MS);
        ratio = Math.min((video.currentTime * 1000) / duration, 1);
      } else if (playingRef.current) {
        elapsed.current += dt;
        ratio = Math.min(elapsed.current / IMAGE_MS, 1);
      }
      progress.current = ratio;
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${ratio})`;
      if (ratio >= 1) nextRef.current();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); frame.current = null; };
  }, []);

  // --- The video element follows the play state -----------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (playing) void video.play().catch(() => {});
    else video.pause();
  }, [playing, muted, pos, ready]);

  // --- Preload the next story so advancing never flickers -------------------
  useEffect(() => {
    const target = nextPosition(groups, pos);
    const upcoming = target ? storyAt(groups, target) : null;
    if (upcoming?.mediaType === 'image' && upcoming.mediaUrl) {
      const image = new window.Image();
      image.src = mediaVariant(upcoming.mediaUrl, 'large');
    }
  }, [groups, pos]);

  // --- A hidden tab pauses; a failed media skips on after a beat ------------
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!failed) return;
    const timer = window.setTimeout(() => nextRef.current(), ERROR_SKIP_MS);
    return () => window.clearTimeout(timer);
  }, [failed]);

  // --- Keyboard: arrows, space, M — but not while the reply box has focus ----
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing) return; // Escape is the dialog's; every other key belongs to the field
      if (event.key === 'ArrowRight') { event.preventDefault(); nextRef.current(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); prev(); }
      else if (event.key === ' ') { event.preventDefault(); setPaused(value => !value); }
      else if (event.key === 'm' || event.key === 'M') setMuted(value => { sessionMuted = !value; return !value; });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [prev]);

  return {
    pos, story, group,
    paused, hold, muted, ready, failed, playing,
    setHold, setPaused, setFocused,
    togglePause, toggleMute,
    next, prev, goToUser,
    isFirst: pos.user === 0 && pos.story === 0,
    isLast: nextPosition(groups, pos) === null,
    onMediaReady: () => setMedia({ id: storyId, ready: true, failed: false }),
    onMediaError: () => setMedia({ id: storyId, ready: false, failed: true }),
  };
}
