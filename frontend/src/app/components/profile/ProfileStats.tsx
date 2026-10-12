'use client';

import { type FollowListTab } from '../FollowListModal';

// A list a visitor may not read still reads as a statistic: the count stays, the
// button cannot be pressed, and the reason waits on hover. A disabled button shows
// no tooltip of its own, so the hint sits on the wrapper around it.
const LOCKED_HINTS: Record<FollowListTab, string> = {
  followers: 'Follow this account to see who follows them.',
  following: 'Follow this account to see who they follow.',
};

export default function ProfileStats({ postCount, followers, following, canOpen, onOpen }: {
  postCount: number;
  followers: number;
  following: number;
  canOpen: boolean;
  onOpen: (tab: FollowListTab) => void;
}) {
  return <div className="profile-stats" aria-label="Profile statistics">
    <span className="profile-stat" aria-label="Post count"><strong>{postCount}</strong> {postCount === 1 ? 'post' : 'posts'}</span>
    <ListStat tab="followers" count={followers} canOpen={canOpen} onOpen={onOpen} />
    <ListStat tab="following" count={following} canOpen={canOpen} onOpen={onOpen} />
  </div>;
}

function ListStat({ tab, count, canOpen, onOpen }: {
  tab: FollowListTab;
  count: number;
  canOpen: boolean;
  onOpen: (tab: FollowListTab) => void;
}) {
  return <span className="profile-stat-lock" title={canOpen ? undefined : LOCKED_HINTS[tab]}>
    <button type="button" className="profile-stat" disabled={!canOpen} onClick={() => onOpen(tab)}>
      <strong>{count}</strong> {tab === 'followers' ? (count === 1 ? 'follower' : 'followers') : 'following'}
    </button>
  </span>;
}

