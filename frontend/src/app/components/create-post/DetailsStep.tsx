'use client';

import { useState } from 'react';
import { ChevronDown, Globe, ImagePlus, Lock, Smile, Users } from 'lucide-react';
import { type SocialUser, displayName } from '../../api/social';
import Avatar from '../Avatar';
import { geometry, imageStyle, boxStyle, MEDIA_SQUARE } from './useCropper';
import { CAPTION_MAX, type CreateContext, type SelectedImage } from './types';

/** The app's emoji set, the same eight the chat composer offers. */
const EMOJI = ['😀', '❤️', '👍', '🎉', '😂', '🙏', '👋', '🔥'];

/** The three audiences, worded with the icon that closes the feed card's header. */
const PRIVACY = [
  { value: 'public' as const, label: 'Public', desc: 'Anyone on or off Social Network', Icon: Globe },
  { value: 'followers' as const, label: 'Followers', desc: 'Your followers only', Icon: Users },
  { value: 'selected' as const, label: 'Only me', desc: 'Only the followers you choose', Icon: Lock },
];

/** One photo as the details step shows it: the framed result, with its letterbox bars. */
function Preview({ image }: { image: SelectedImage }) {
  const view = geometry(image, MEDIA_SQUARE);
  return <div className="cp-crop-box" style={boxStyle(view)}>
    <img className="cp-crop-img" style={imageStyle(view)} src={image.url} alt="" draggable={false} />
  </div>;
}

/**
 * Step 3: the caption and the settings, in the panel beside the framed photos.
 *
 * The left column shows the crop the post will carry, with arrows and dots when there is more than
 * one photo. The right column is the author, the caption with its emoji and counter, and the rows
 * this app actually has: the audience, and — in text mode — a way back to the picker. Rows the
 * backend cannot store (alt text, location, collaborators) are deliberately absent.
 */
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
  privacy: 'public' | 'followers' | 'selected';
  onPrivacy: (value: 'public' | 'followers' | 'selected') => void;
  followers: SocialUser[];
  selectedFollowers: string[];
  onToggleFollower: (id: string) => void;
  followersLoading: boolean;
  onAddPhotos: () => void;
  captionRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const current = PRIVACY.find(option => option.value === privacy) ?? PRIVACY[0];

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
          <button type="button" className="cp-emoji-btn" aria-label="Choose emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(value => !value)}><Smile aria-hidden="true" /></button>
          <span className="cp-counter" data-over={caption.length >= CAPTION_MAX}>{caption.length}/{CAPTION_MAX.toLocaleString()}</span>
        </div>
        {emojiOpen && <div className="cp-emoji-pop" aria-label="Emoji picker">
          {EMOJI.map(emoji => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => onCaption((caption + emoji).slice(0, CAPTION_MAX))}>{emoji}</button>)}
        </div>}
      </div>

      <div className="cp-rows">
        {context === 'group'
          ? <div className="cp-row"><Users size={20} aria-hidden="true" /><span className="cp-row-label">Sharing to</span><span className="cp-row-value" dir="auto">{groupName}</span></div>
          : <>
            <button type="button" className="cp-row" aria-expanded={audienceOpen} onClick={() => setAudienceOpen(value => !value)}>
              <current.Icon size={20} aria-hidden="true" />
              <span className="cp-row-label">Audience</span>
              <span className="cp-row-value">{current.label}</span>
              <ChevronDown className="cp-row-chev" aria-hidden="true" />
            </button>
            {audienceOpen && <div className="cp-sub" role="radiogroup" aria-label="Audience">
              {PRIVACY.map(option => <label key={option.value} className="cp-radio">
                <input type="radio" name="cp-privacy" checked={privacy === option.value} onChange={() => onPrivacy(option.value)} />
                <span className="cp-radio-text">
                  <span className="cp-radio-title">{option.label}</span>
                  <span className="cp-radio-desc">{option.desc}</span>
                </span>
              </label>)}
              {privacy === 'selected' && <div className="cp-selected-list">
                {followersLoading && <span className="cp-radio-desc">Loading followers…</span>}
                {!followersLoading && followers.length === 0 && <span className="cp-radio-desc">You do not have any followers yet.</span>}
                {followers.map(person => <label key={person.userId} className="cp-chip">
                  <input type="checkbox" checked={selectedFollowers.includes(person.userId)} onChange={() => onToggleFollower(person.userId)} />
                  <span dir="auto">{displayName(person)}</span>
                </label>)}
              </div>}
            </div>}
          </>}
        {textMode && <button type="button" className="cp-addrow" onClick={onAddPhotos}><ImagePlus aria-hidden="true" />Add photos</button>}
      </div>
    </div>
  </>;
}
