'use client';

import type { ReactNode, RefObject } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { isoTimestamp, shortAge } from '../../api/social';
import Avatar from '../Avatar';
import StoryProgressBar from './StoryProgressBar';

export default function StoryHeader({ story, count, current, fillRef, paused, muted, onTogglePause, onToggleMute, menu }: {
  story: { nickname: string; avatar: string; createdAt: string; mediaType: string };
  count: number;
  current: number;
  fillRef: RefObject<HTMLSpanElement | null>;
  paused: boolean;
  muted: boolean;
  onTogglePause: () => void;
  onToggleMute: () => void;
  menu: ReactNode;
}) {
  return <div className="story-head-wrap">
    <StoryProgressBar count={count} current={current} fillRef={fillRef} />
    <div className="story-head">
      <span className="story-head-ring"><Avatar name={story.nickname} avatarUrl={story.avatar} size={32} /></span>
      <span className="story-head-handle">{story.nickname}</span>
      <time className="story-head-age" dateTime={isoTimestamp(story.createdAt)}>{shortAge(story.createdAt)}</time>
      <div className="story-head-controls">
        <button type="button" onClick={onTogglePause} aria-label={paused ? 'Play' : 'Pause'}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
        {story.mediaType === 'video' && <button type="button" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>}
        {menu}
      </div>
    </div>
  </div>;
}
