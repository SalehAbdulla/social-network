'use client';

import { useState } from 'react';
import { ImagePlus, Smile, Users } from 'lucide-react';
import { type SocialUser } from '../../api/social';
import Avatar from '../Avatar';
import { geometry, imageStyle, boxStyle, MEDIA_SQUARE } from './useCropper';
import { CAPTION_MAX, type CreateContext, type SelectedImage } from './types';
import { ROW } from './rows';
import VisibilityRow from './VisibilityRow';
import { type Visibility } from './visibility';

const EMOJI = ['😀', '❤️', '👍', '🎉', '😂', '🙏', '👋', '🔥'];

function Preview({ image }: { image: SelectedImage }) {
  const view = geometry(image, MEDIA_SQUARE);
  return <div className="cp-crop-box" style={boxStyle(view)}>
    <img className="cp-crop-img" style={imageStyle(view)} src={image.url} alt="" draggable={false} />
  </div>;
}

export default function DetailsStep({ context, groupName, groupAvatar, images, index, onIndex, textMode, caption, onCaption, privacy, onPrivacy, followers, selectedFollowers, onToggleFollower, followersLoading, onAddPhotos, captionRef }: {
  context: CreateContext;
  groupName: string;
  groupAvatar: string;
  images: SelectedImage[];
  index: number;
  onIndex: (i: number) => void;
  textMode: boolean;
  caption: string;
  onCaption: (value: string) => void;
  privacy: Visibility;
  onPrivacy: (value: Visibility) => void;
  followers: SocialUser[];
  selectedFollowers: string[];
  onToggleFollower: (id: string) => void;
  followersLoading: boolean;
  onAddPhotos: () => void;
  captionRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);

  return <>
    {!textMode && <div className="cp-media">
      {images.length > 0 && <Preview image={images[index]} />}
      {images.length > 1 && <>
        <button type="button" className="cp-ctl" style={{ position: 'absolute', top: '50%', insetInlineStart: 12, transform: 'translateY(-50%)' }} aria-label="Previous photo" onClick={() => onIndex((index - 1 + images.length) % images.length)}>‹</button>
        <button type="button" className="cp-ctl" style={{ position: 'absolute', top: '50%', insetInlineEnd: 12, transform: 'translateY(-50%)' }} aria-label="Next photo" onClick={() => onIndex((index + 1) % images.length)}>›</button>
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
          {images.map((image, position) => <span key={image.id} aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 9999, background: position === index ? '#fff' : 'rgba(255,255,255,0.4)' }} />)}
        </div>
      </>}
    </div>}

    <div className="cp-panel">
      <div className="cp-author">
        <Avatar name={context === 'group' ? groupName : 'You'} avatarUrl={context === 'group' ? groupAvatar : undefined} size={28} />
        <span className="cp-author-name" dir="auto">{context === 'group' ? groupName : 'You'}</span>
      </div>

      <div className="cp-caption-wrap">
        <textarea
          ref={captionRef}
          className="cp-caption"
          dir="auto"
          placeholder="Write a caption..."
          maxLength={CAPTION_MAX}
          value={caption}
          onChange={event => onCaption(event.target.value.slice(0, CAPTION_MAX))}
        />
        <div className="cp-caption-foot">
          <button type="button" className="flex size-7 items-center justify-center rounded-full text-text transition-colors hover:bg-dm-surface motion-reduce:transition-none" aria-label="Choose emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(value => !value)}><Smile size={20} aria-hidden="true" /></button>
          <span className="cp-counter" data-over={caption.length >= CAPTION_MAX}>{caption.length}/{CAPTION_MAX.toLocaleString()}</span>
        </div>
        {emojiOpen && <div className="cp-emoji-pop" aria-label="Emoji picker">
          {EMOJI.map(emoji => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => onCaption((caption + emoji).slice(0, CAPTION_MAX))}>{emoji}</button>)}
        </div>}
      </div>
      <div className="cp-rows">
        {context === 'group'
          ? <div className="cp-row"><Users size={20} aria-hidden="true" /><span className="cp-row-label">Sharing to</span><span className="cp-row-value" dir="auto">{groupName}</span></div>
          : <VisibilityRow value={privacy} onChange={onPrivacy} followers={followers} selected={selectedFollowers} onToggle={onToggleFollower} loading={followersLoading} />}
        {textMode && <button id='btn' type="button" className={ROW} onClick={onAddPhotos}><ImagePlus size={20} aria-hidden="true" />photo</button>}
      </div>
    </div>
  </>;
}
