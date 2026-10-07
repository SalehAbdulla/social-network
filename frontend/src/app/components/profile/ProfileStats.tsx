'use client';

import { type FollowListTab } from '../FollowListModal';

/**
 * The three counts on a profile, on one line at 16px. Posts is a label — it is not a
 * destination — while followers and following open the shared list dialog. The singular is used
 * for a count of one, which is what a reader expects of "1 follower".
 */
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
