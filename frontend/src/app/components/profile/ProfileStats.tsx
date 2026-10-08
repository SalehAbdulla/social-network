'use client';

import { type FollowListTab } from '../FollowListModal';

export default function ProfileStats({ postCount, followers, following, canOpen, onOpen }: {
  postCount: number;
  followers: number;
  following: number;
  canOpen: boolean;
  onOpen: (tab: FollowListTab) => void;
}) {
  return <div className="profile-stats" aria-label="Profile statistics">
    <span className="profile-stat" aria-label="Post count"><strong>{postCount}</strong> {postCount === 1 ? 'post' : 'posts'}</span>
    <button type="button" className="profile-stat" disabled={!canOpen} onClick={() => onOpen('followers')}><strong>{followers}</strong> {followers === 1 ? 'follower' : 'followers'}</button>
    <button type="button" className="profile-stat" disabled={!canOpen} onClick={() => onOpen('following')}><strong>{following}</strong> following</button>
  </div>;
}
