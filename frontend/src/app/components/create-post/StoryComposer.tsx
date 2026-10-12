'use client';

import { useLayoutEffect } from 'react';
import { ImagePlus, Palette, Type } from 'lucide-react';
import { type SocialUser } from '../../api/social';
import { fitStoryText } from '../../lib/storyText';
import Avatar from '../Avatar';
import { ROW } from './rows';
import VisibilityRow from './VisibilityRow';
import { type Visibility } from './visibility';

export const STORY_MAX = 1000;
export const STORY_COLORS = ['#4f46e5', '#0f172a', '#be185d', '#047857', '#b45309', '#7c3aed'];

export default function StoryComposer({ text, onText, color, onColor, media, onPickMedia, onClearMedia, textRef, privacy, onPrivacy, followers, selectedFollowers, onToggleFollower, followersLoading }: {
  text: string;
  onText: (value: string) => void;
  color: string;
  onColor: (value: string) => void;
  media: { preview: string; kind: 'image' | 'video' } | null;
  onPickMedia: () => void;
  onClearMedia: () => void;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  privacy: Visibility;
  onPrivacy: (value: Visibility) => void;
  followers: SocialUser[];
  selectedFollowers: string[];
  onToggleFollower: (id: string) => void;
  followersLoading: boolean;
}) {
  // A multi-line moment has to be read in full while it is written, so the text
  // shrinks to fit the frame instead of being cropped behind a scrollbar.
  useLayoutEffect(() => {
    const area = textRef.current;
    if (!area) return;
    const fit = () => fitStoryText(area, 18, 12);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [text, media, textRef]);

  return <div className="cp-panel">
    <div className="cp-author">
      <Avatar name="You" size={28} />
      <span className="cp-author-name">You</span>
    </div>

    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="relative flex items-center justify-center overflow-hidden rounded-[8px]" style={{ backgroundColor: color, aspectRatio: '9 / 16', height: 'min(52vh, 460px)' }}>
        {media
          ? media.kind === 'video'
            ? <video src={media.preview} controls className="h-full w-full object-cover" />
            : <img src={media.preview} alt="" className="h-full w-full object-cover" />
          : <textarea
            ref={textRef}
            value={text}
            maxLength={STORY_MAX}
            onChange={event => onText(event.target.value)}
            placeholder="Share a moment?"
            dir="auto"
            className="w-full resize-none overflow-y-auto bg-transparent p-4 text-center text-white outline-none placeholder:text-white/70"
          />}
      </div>
    </div>

    <div className="cp-rows">
      <VisibilityRow id="story-audience" value={privacy} onChange={onPrivacy} followers={followers} selected={selectedFollowers} onToggle={onToggleFollower} loading={followersLoading} name="story-privacy" />
      {media
        ? <button id="story-media" type="button" className={ROW} onClick={onClearMedia}><Type size={20} aria-hidden="true" />Use text instead</button>
        : <button id="story-media" type="button" className={ROW} onClick={onPickMedia}><ImagePlus size={20} aria-hidden="true" />photo</button>}
      {!media && <label id="story-background" className={ROW}>
        <div className='mt-2'/>
        <Palette size={20} aria-hidden="true" />
        <span className="cp-row-label">Background</span>
        <input type="color" value={color} onChange={event => onColor(event.target.value)} aria-label="Background colour" className="h-6 w-8 cursor-pointer rounded-[4px] border-0 bg-transparent p-0" />
      </label>}
    </div>
  </div>;
}
