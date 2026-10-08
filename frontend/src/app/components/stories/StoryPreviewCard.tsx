'use client';

import { useState } from 'react';
import { shortAge } from '../../api/social';
import { mediaVariant } from '../../lib/mediaVariants';
import StoryRing from './StoryRing';

export default function StoryPreviewCard({ story, side, unseen, onClick }: {
  story: { nickname: string; avatar: string; createdAt: string; mediaType: string; mediaUrl: string; backgroundColor: string };
  side: 'left' | 'right';
  unseen: boolean;
  onClick: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const showMedia = !broken && !!story.mediaUrl && (story.mediaType === 'image' || story.mediaType === 'video');
  const fallback = `linear-gradient(135deg, ${story.backgroundColor || '#1f2937'}, rgba(0, 0, 0, 0.65))`;
  return <button type="button" className="story-preview" data-side={side} onClick={onClick} aria-label={`Open ${story.nickname}'s story`}>
    <span className="story-preview-thumb" style={{ backgroundImage: fallback }}>
      {showMedia && story.mediaType === 'image' && <img src={mediaVariant(story.mediaUrl, 'thumb')} alt="" aria-hidden="true" onError={() => setBroken(true)} />}
      {showMedia && story.mediaType === 'video' && <video src={mediaVariant(story.mediaUrl, 'thumb')} muted playsInline preload="metadata" aria-hidden="true" onError={() => setBroken(true)} />}
      <span className="story-preview-scrim" aria-hidden="true" />
      <span className="story-preview-body">
        <StoryRing name={story.nickname} avatarUrl={story.avatar} size={56} seen={!unseen} />
        <span className="story-preview-name">{story.nickname}</span>
        <time className="story-preview-age" dateTime={story.createdAt}>{shortAge(story.createdAt)}</time>
      </span>
    </span>
  </button>;
}

