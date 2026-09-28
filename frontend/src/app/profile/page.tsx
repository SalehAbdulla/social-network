'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';

import {
  type MediaItem,
  type Post,
  type SocialUser,
  type SocketEvent,
  dateLabel,
  displayName,
  errorMessage,
  request,
} from '../api/social';

import { useBackend } from '../components/BackendProvider';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';

import Avatar from '../components/Avatar';
import EditProfile from '../components/EditProfile';
import FollowListModal, {
  type FollowListTab,
} from '../components/FollowListModal';
import Loading from '../components/Loading';
import LoadMore from '../components/LoadMore';
import PostCard from '../components/PostCard';
import RequestState from '../components/RequestState';
import { PostListSkeleton } from '../components/Skeletons';

const POSTS_PER_PAGE = 20;

type ProfileTab = 'posts' | 'media' | 'likes';

const PROFILE_TABS: ProfileTab[] = ['posts', 'media', 'likes'];

export default function Profile() {
  const { user, refreshUser } = useBackend();
  const params = useParams<{ profileId?: string }>();

  const profileId = params.profileId || user.userId;
  const profile = useResource<SocialUser>(`/users/${profileId}`);

  const isOwnProfile = profileId === user.userId;
  const isFollowing = user.following.includes(profileId);

  const canViewProfile =
    isOwnProfile ||
    !!profile.data?.isPublic ||
    isFollowing;


  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  const posts = usePagedList<Post, Post[]>({
    // The tab is part of the identity, so switching tabs restarts from offset 0.
    key: `/users/${profileId}/posts?liked=${activeTab === 'likes'}`,
    pageQuery: page => `&offset=${(page - 1) * POSTS_PER_PAGE}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: post => post.postId,
    enabled: !!profile.data && canViewProfile,
  });

  // The media tab lists post and comment photos together, so it reads its own
  // endpoint instead of deriving the grid from the posts above.
  const media = usePagedList<MediaItem, MediaItem[]>({
    key: `/users/${profileId}/media`,
    // No query in the key, so the first page parameter carries the `?` itself.
    pageQuery: page => `?offset=${(page - 1) * POSTS_PER_PAGE}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: item => `${item.postId}-${item.url}`,
    enabled: !!profile.data && canViewProfile && activeTab === 'media',
  });


  const [isEditing, setIsEditing] = useState(false);
  const [followListTab, setFollowListTab] = useState<FollowListTab | null>(null);
  const [isFollowingBusy, setIsFollowingBusy] = useState(false);

  const closeFollowList = useCallback(() => setFollowListTab(null), []);

  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const socketEvent = event as CustomEvent<SocketEvent>;
      const eventType = socketEvent.detail.type;

      if (eventType === 'social_changed' || eventType === 'connected') {
        profile.reload();
        posts.reload();
        media.reload();
      }
    };

    window.addEventListener('social:socket', handleSocketEvent);

    return () => {
      window.removeEventListener('social:socket', handleSocketEvent);
    };
  }, [profile.reload, posts.reload, media.reload]);

  async function handleToggleFollow() {
    if (isFollowingBusy) return;

    setIsFollowingBusy(true);

    try {
      await request(
        `/users/${profileId}/follow`,
        isFollowing || profile.data?.pendingOutgoing ? 'DELETE' : 'PUT',
      );

      await refreshUser();

      profile.reload();
      posts.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsFollowingBusy(false);
    }
  }

  function handleTabChange(tab: ProfileTab) {
    setActiveTab(tab);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Profile loading state */}
      {profile.loading && <Loading />}

      {/* Profile */}
      {profile.data && (
        <>
          <ProfileHeader
            profile={profile.data}
            currentUser={user}
            isOwnProfile={isOwnProfile}
            isFollowing={isFollowing}
            isFollowingBusy={isFollowingBusy}
            onEdit={() => setIsEditing(true)}
            onToggleFollow={() => void handleToggleFollow()}
            canOpenFollowLists={canViewProfile}
            onOpenFollowList={setFollowListTab}
          />

          {/* Private profile */}
          {!canViewProfile ? (
            <RequestState
              empty="This profile is private. Follow this person to see their posts and activity."
            />
          ) : (
            <>
              <ProfileTabs
                activeTab={activeTab}
                onChange={handleTabChange}
              />

              {/* Posts and media */}
              {(activeTab === 'media' ? media.loading : posts.loading) && <PostListSkeleton />}

              {activeTab === 'media' ? (
                <MediaGrid items={media.items} />
              ) : (
                <PostList
                  posts={posts.items}
                  onRemoved={postId => posts.update(items => items.filter(item => item.postId !== postId))}
                />
              )}

              {/* Empty state */}
              {activeTab === 'media'
                ? media.settled && !media.error && media.items.length === 0 && (
                    <RequestState empty="No photos yet." />
                  )
                : posts.settled && !posts.error && posts.items.length === 0 && (
                    <RequestState
                      empty={activeTab === 'likes' ? 'No liked posts yet.' : 'No posts yet.'}
                    />
                  )}

              {activeTab === 'media'
                ? media.items.length > 0 && (
                    <LoadMore
                      loading={media.loadingMore}
                      hasMore={media.hasMore}
                      onLoadMore={media.loadMore}
                      label="Load more photos"
                    />
                  )
                : posts.items.length > 0 && (
                    <LoadMore
                      loading={posts.loadingMore}
                      hasMore={posts.hasMore}
                      onLoadMore={posts.loadMore}
                      label="Load more posts"
                    />
                  )}
            </>
          )}

          {/* Edit profile */}
          {isEditing && (
            <EditProfile
              profile={profile.data}
              close={() => setIsEditing(false)}
              saved={profile.reload}
            />
          )}
        {/* Followers and following */}
          {followListTab && (
            <FollowListModal
              userId={profile.data.userId}
              initialTab={followListTab}
              close={closeFollowList}
            />
          )}
        </>
      )}
    </div>
  );
}


type ProfileHeaderProps = {
  profile: SocialUser;
  currentUser: SocialUser;
  isOwnProfile: boolean;
  isFollowing: boolean;
  isFollowingBusy: boolean;
  onEdit: () => void;
  onToggleFollow: () => void;
  canOpenFollowLists: boolean;
  onOpenFollowList: (tab: FollowListTab) => void;
};

function ProfileHeader({
  profile,
  currentUser,
  isOwnProfile,
  isFollowing,
  isFollowingBusy,
  onEdit,
  onToggleFollow,
  canOpenFollowLists,
  onOpenFollowList,
}: ProfileHeaderProps) {
  const profileOwner = isOwnProfile ? currentUser : profile;

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      {/* Cover */}
      <div className="h-44 bg-linear-to-r from-brand-1/30 to-brand-2/25">
        {profile.coverPhoto && (
          <img
            src={profile.coverPhoto}
            alt="Cover photo"
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="space-y-4 p-6">
        {/* Avatar + Actions */}
        <div className="flex items-center justify-between gap-4">
          <Avatar
            name={displayName(profile)}
            avatarUrl={profile.avatar}
            size={80}
          />

          {isOwnProfile ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg border border-slate-200 px-4 py-2"
            >
              Edit profile
            </button>
          ) : (
            <ProfileActions
              pendingOutgoing={profile.pendingOutgoing}
              pendingIncoming={profile.pendingIncoming}
              isFollowing={isFollowing}
              isFollowingBusy={isFollowingBusy}
              profileId={profile.userId}
              onToggleFollow={onToggleFollow}
            />
          )}
        </div>

        {/* Name */}
        <div>
          <h1 className="text-2xl font-bold">
            {displayName(profile)}
          </h1>

          <p className="text-slate-500">
            @{profile.nickname}
          </p>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="whitespace-pre-wrap wrap-break-word">
            {profile.bio}
          </p>
        )}

        {/* Location / Joined */}
        <p className="min-w-0 text-sm text-slate-400 [overflow-wrap:anywhere]">
          {profile.location && `${profile.location} • `}
          Joined {dateLabel(profile.createdAt)}
        </p>

        {/* Statistics */}
        <div
          aria-label="Profile statistics"
          className="flex flex-wrap gap-5 text-sm"
        >
          <button
            type="button"
            disabled={!canOpenFollowLists}
            onClick={() => onOpenFollowList('followers')}
            className={canOpenFollowLists ? 'hover:underline' : 'cursor-default'}
          >
            <b>{profileOwner.followers.length}</b> followers
          </button>

          <button
            type="button"
            disabled={!canOpenFollowLists}
            onClick={() => onOpenFollowList('following')}
            className={canOpenFollowLists ? 'hover:underline' : 'cursor-default'}
          >
            <b>{profileOwner.following.length}</b> following
          </button>
        </div>
      </div>
    </section>
  );
}

type ProfileActionsProps = {
  pendingOutgoing: boolean;
  pendingIncoming: boolean;
  profileId: string;
  isFollowing: boolean;
  isFollowingBusy: boolean;
  onToggleFollow: () => void;
};

function ProfileActions({
  pendingOutgoing,
  pendingIncoming,
  profileId,
  isFollowing,
  isFollowingBusy,
  onToggleFollow,
}: ProfileActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {pendingIncoming && <Link href="/notifications" className="rounded-lg border border-border px-4 py-2 text-brand-1">Review follow request</Link>}
      <button
        type="button"
        disabled={isFollowingBusy || (pendingIncoming && !isFollowing)}
        title={pendingOutgoing ? 'Cancel follow request' : isFollowing ? 'Unfollow' : undefined}
        onClick={onToggleFollow}
        className="rounded-lg border border-blue-200 px-4 py-2 text-blue-700 disabled:opacity-50"
      >
        {isFollowingBusy
          ? 'Updating...'
          : isFollowing
            ? 'Unfollow'
            : pendingOutgoing ? 'Requested' : 'Follow'}
      </button>

      <Link
        href={`/messages/${profileId}`}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white"
      >
        Message
      </Link>
    </div>
  );
}


type ProfileTabsProps = {
  activeTab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
};

function ProfileTabs({
  activeTab,
  onChange,
}: ProfileTabsProps) {
  return (
    <div className="flex justify-center items-center gap-2">
      {PROFILE_TABS.map((tab) => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`px-5 py-2 capitalize cursor-pointer ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-white'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}


type PostListProps = {
  posts: Post[];
  /** Drops a deleted post from the loaded pages without re-reading them. */
  onRemoved: (postId: number) => void;
};

function PostList({
  posts,
  onRemoved,
}: PostListProps) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.postId}
          post={post}
          onPostRemoved={onRemoved}
        />
      ))}
    </div>
  );
}

type MediaGridProps = {
  items: MediaItem[];
};

function MediaGrid({ items }: MediaGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <Link
          key={`${item.postId}-${item.url}`}
          href={`/post/${item.postId}`}
        >
          <img
            src={item.url}
            alt={item.title}
            className="h-48 w-full rounded-lg object-cover"
          />
        </Link>
      ))}
    </div>
  );
}
