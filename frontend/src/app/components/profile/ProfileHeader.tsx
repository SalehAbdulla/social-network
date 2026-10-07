'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Link2, Mail, MapPin, Phone, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import { type SocialUser, displayName, errorMessage, request } from '../../api/social';
import { linkify } from '../../lib/linkify';
import Avatar from '../Avatar';
import StoryRing from '../stories/StoryRing';
import MessageAction from '../MessageAction';
import Button from '../ui/Button';
import Menu, { MenuItem } from '../ui/Menu';
import ThemeToggle from '../ThemeToggle';
import { MenuItem as PopoverItem, MenuPanel, menuRowClass } from '../PopoverMenu';
import ProfileStats from './ProfileStats';
import type { FollowListTab } from '../FollowListModal';

export type FollowState = 'none' | 'following' | 'requested';

/**
 * The Instagram profile header: a centred block with the 150px avatar on the left and, beside it,
 * the handle row (the username and one settings/more button), the display name, the counts, the
 * bio and the two action buttons. When the profile has a live story the avatar wears the story
 * ring and opens it on a tap, owner and visitor alike; with no story the owner's avatar is the
 * "change photo" control and the gear opens the settings menu, and on anyone else's the buttons
 * are Follow (or Following with its unfollow menu) and Message.
 */
export default function ProfileHeader({
  profile, followers, following, isOwner, avatarSize, followState, canMessage, isFollowingBusy,
  hasStories, storyUnseen, onAvatarClick, onOpenStories, onEdit, onArchive, onChangePassword, onOpenFollows, onToggleFollow,
}: {
  profile: SocialUser;
  followers: number;
  following: number;
  isOwner: boolean;
  avatarSize: number;
  followState: FollowState;
  canMessage: boolean;
  isFollowingBusy: boolean;
  /** Whether this profile has a live story, which the avatar opens on a tap. */
  hasStories: boolean;
  /** Whether the viewer still has an unseen story of this author's. */
  storyUnseen: boolean;
  onAvatarClick: () => void;
  onOpenStories: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onChangePassword: () => void;
  onOpenFollows: (tab: FollowListTab) => void;
  onToggleFollow: () => void;
}) {
  const name = displayName(profile);
  // With a live story the avatar wears the shared story ring — the same one the tray draws, sized
  // to the profile photo so the face stays the same `avatarSize` inside it. Without one it is the
  // plain photo. `marker` is off because this ring is not a tray item.
  const face = hasStories
    ? <StoryRing name={name} avatarUrl={profile.avatar} size={avatarSize} seen={isOwner || !storyUnseen} own={isOwner} marker={false} />
    : <Avatar name={name} avatarUrl={profile.avatar} size={avatarSize} />;
  // A profile with a live story opens it on a tap, the way Instagram does, for owner and visitor
  // alike; the owner changes the photo from the Edit profile dialog instead. With no story the
  // owner's tap still opens that dialog, and a visitor's avatar is not a control.
  const avatarControl: { label: string; onClick: () => void } | null = hasStories
    ? { label: isOwner ? 'View your story' : `View ${profile.nickname}'s story`, onClick: onOpenStories }
    : isOwner
      ? { label: 'Change profile photo', onClick: onAvatarClick }
      : null;
  return <header className="profile-header">
    <div className="profile-avatar-col">
      {avatarControl
        ? <button type="button" className="profile-avatar" data-clickable="true" aria-label={avatarControl.label} onClick={avatarControl.onClick}>{face}</button>
        : <span className="profile-avatar">{face}</span>}
    </div>

    <div className="profile-info">
      <div className="profile-actions">
        <h1 className="profile-username">{profile.nickname}</h1>
        {isOwner && <SettingsMenu onChangePassword={onChangePassword} />}
      </div>

      {name !== profile.nickname && <p className="profile-name" dir="auto">{name}</p>}
      <ProfileStats postCount={profile.postCount} followers={followers} following={following} canOpen onOpen={onOpenFollows} />
      <Bio profile={profile} isOwner={isOwner} />

      <div className="profile-actions-buttons">
        {isOwner ? <>
          <Button variant="secondary" className="profile-btn" onClick={onEdit}>Edit profile</Button>
          <Button variant="secondary" className="profile-btn" onClick={onArchive}>View archive</Button>
        </> : <>
          <FollowControl state={followState} busy={isFollowingBusy} onToggle={onToggleFollow} />
          <MessageAction userId={profile.userId} allowed={canMessage} className="ui-btn ui-btn-secondary profile-btn" />
        </>}
        {(!!profile.contactEmail || !!profile.phone) && <ContactButton email={profile.contactEmail} phone={profile.phone} emailHidden={isOwner && !profile.showContactEmail} phoneHidden={isOwner && !profile.showPhone} />}
      </div>
    </div>
  </header>;
}

/** `Follow`, or `Following` with a chevron that opens the unfollow menu. */
function FollowControl({ state, busy, onToggle }: { state: FollowState; busy: boolean; onToggle: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The popover owns its own open state, so it also owns Escape and the click-outside that close it.
  useEffect(() => {
    if (!rect) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setRect(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRect(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [rect]);

  if (state === 'none') return <Button variant="primary" className="profile-btn" loading={busy} onClick={onToggle}>Follow</Button>;
  return <div ref={root} className="relative">
    <Button
      variant="secondary"
      className="profile-btn"
      loading={busy}
      aria-haspopup="menu"
      aria-expanded={!!rect}
      onClick={event => { const box = event.currentTarget.getBoundingClientRect(); setRect(current => current ? null : box); }}
    >
      {state === 'requested' ? 'Requested' : 'Following'}<ChevronDown size={16} aria-hidden="true" />
    </Button>
    {rect && <MenuPanel menuRef={menuRef} rect={rect} width={180} placement="below" label="Following options">
      <PopoverItem onClick={() => { setRect(null); onToggle(); }}>{state === 'requested' ? 'Cancel request' : 'Unfollow'}</PopoverItem>
    </MenuPanel>}
  </div>;
}

/** The gear menu on the viewer's own profile: the account and theme actions Instagram keeps here. */
function SettingsMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try {
      await request('/auth/logout', 'POST');
      // A full reload drops the socket and every other piece of client state, as the rail does.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch (error) { toast.error(errorMessage(error)); setLoggingOut(false); }
  }
  return <Menu label="Options" triggerIcon={Settings} className="profile-gear" align="end">
    <MenuItem onClick={onChangePassword}>Change password</MenuItem>
    <Link href="/saved" role="menuitem" className="ui-menu-item">Saved</Link>
    <div className="ui-menu-item justify-between"><span>Theme</span><ThemeToggle /></div>
    <MenuItem onClick={() => void logout()} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</MenuItem>
  </Menu>;
}

/** The display name, the bio (clamped to four lines with a "more" toggle) and the location. */
function Bio({ profile, isOwner }: { profile: SocialUser; isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const node = text.current;
    if (!node || expanded) return;
    setOverflowing(node.scrollHeight - node.clientHeight > 1);
  }, [profile.bio, expanded]);
  if (!profile.bio && !profile.location && !profile.website) return null;
  return <div className="profile-bio">
    {!!profile.bio && <>
      <p ref={text} className="profile-bio-text" data-clamped={!expanded} dir="auto">{linkify(profile.bio)}</p>
      {overflowing && <button type="button" className="profile-bio-toggle" onClick={() => setExpanded(value => !value)}>{expanded ? 'less' : 'more'}</button>}
    </>}
    {!!profile.location && <p className="profile-bio-location"><MapPin aria-hidden="true" /><span dir="auto">{profile.location}</span></p>}
    {!!profile.website && <p className="profile-bio-website"><Link2 aria-hidden="true" /><a href={profile.website} target="_blank" rel="me noopener noreferrer nofollow" dir="auto">{websiteLabel(profile.website)}</a>{isOwner && !profile.showWebsite && <HiddenTag />}</p>}
  </div>;
}

/** The website's label on the profile: the URL without its scheme or a trailing slash, the way a
 *  reader says it out loud. The link itself keeps the full, stored address. */
function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Instagram's Contact button: a secondary button under the profile's action pair that opens a
 * small menu with the account's published email and phone, each a `mailto:`/`tel:` link. It is
 * drawn only when at least one of them exists — `writeProfile` blanks a field whose own public
 * switch is off, and both for a viewer who may not see the profile at all — so it never opens onto
 * an empty menu. For the owner a blanked-but-set field keeps its row and gains a muted "Hidden"
 * note, so the effect of a switch is legible from the profile the owner is looking at.
 */
function ContactButton({ email, phone, emailHidden, phoneHidden }: { email: string; phone: string; emailHidden: boolean; phoneHidden: boolean }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The pane owns its own open state, so it also owns Escape and the click-outside that close it.
  useEffect(() => {
    if (!rect) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menuRef.current?.contains(target)) setRect(null);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRect(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [rect]);

  return <div ref={root} className="profile-contact">
    <Button
      variant="secondary"
      className="profile-btn profile-btn-contact"
      aria-haspopup="menu"
      aria-expanded={!!rect}
      onClick={event => { const box = event.currentTarget.getBoundingClientRect(); setRect(current => current ? null : box); }}
    >
      Contact
    </Button>
    {rect && <MenuPanel menuRef={menuRef} rect={rect} width={220} placement="below" label="Contact">
      {!!email && <a role="menuitem" href={`mailto:${email}`} className={menuRowClass} onClick={() => setRect(null)}><Mail size={20} aria-hidden="true" />Email{emailHidden && <HiddenTag className="ml-auto" />}</a>}
      {!!phone && <a role="menuitem" href={`tel:${phone}`} className={menuRowClass} onClick={() => setRect(null)}><Phone size={20} aria-hidden="true" />Call{phoneHidden && <HiddenTag className="ml-auto" />}</a>}
    </MenuPanel>}
  </div>;
}

/** A muted "Hidden" note beside a set-but-private contact field. It is drawn only for the owner,
 *  so the effect of a public switch is visible from the profile itself rather than only by
 *  looking at the profile as someone else. */
function HiddenTag({ className = '' }: { className?: string }) {
  return <span className={`text-xs font-normal text-slate-400 ${className}`}>Hidden</span>;
}
