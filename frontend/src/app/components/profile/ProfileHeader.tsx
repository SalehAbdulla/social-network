'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Link2, Mail, MapPin, Phone, RefreshCw, Settings } from 'lucide-react';
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
  hasStories: boolean;
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
  const face = hasStories
    ? <StoryRing name={name} avatarUrl={profile.avatar} size={avatarSize} seen={isOwner || !storyUnseen} own={isOwner} marker={false} />
    : <Avatar name={name} avatarUrl={profile.avatar} size={avatarSize} />;
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

function FollowControl({ state, busy, onToggle }: { state: FollowState; busy: boolean; onToggle: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

function SettingsMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try {
      await request('/auth/logout', 'POST');
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/login';
    } catch (error) { toast.error(errorMessage(error)); setLoggingOut(false); }
  }
  return <Menu label="Options" triggerIcon={Settings} className="profile-gear" align="end">
    <MenuItem onClick={onChangePassword}>Change password</MenuItem>
    <Link href="/saved" role="menuitem" className="ui-menu-item">Saved</Link>
    <div className="ui-menu-item justify-between"><span>Theme</span><ThemeToggle /></div>
    <MenuItem onClick={() => window.dispatchEvent(new Event('social:switch-accounts'))}><RefreshCw size={16} aria-hidden="true" />Switch accounts</MenuItem>
    <MenuItem onClick={() => void logout()} disabled={loggingOut}>{loggingOut ? 'Logging out…' : 'Log out'}</MenuItem>
  </Menu>;
}

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

// the scheme and a trailing slash are noise next to the handle
function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function ContactButton({ email, phone, emailHidden, phoneHidden }: { email: string; phone: string; emailHidden: boolean; phoneHidden: boolean }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

function HiddenTag({ className = '' }: { className?: string }) {
  return <span className={`text-xs font-normal text-slate-400 ${className}`}>Hidden</span>;
}
