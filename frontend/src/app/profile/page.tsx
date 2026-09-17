'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';

import {
  type Post,
  type SocialUser,
  type SocketEvent,
  dateLabel,
  displayName,
  errorMessage,
  request,
} from '../api/social';

import { useBackend } from '../components/BackendProvider';
import { useResource } from '../lib/useResource';

import Avatar from '../components/Avatar';
import EditProfile from '../components/EditProfile';
import FollowListModal, {
  type FollowListTab,
} from '../components/FollowListModal';
import Loading from '../components/Loading';
import PostCard from '../components/PostCard';
import RequestState from '../components/RequestState';

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
  const [offset, setOffset] = useState(0);

  const posts = useResource<Post[]>(
    `/users/${profileId}/posts?liked=${activeTab === 'likes'}&offset=${offset}`,
    !!profile.data && canViewProfile,
  );


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
      }
    };

    window.addEventListener('social:socket', handleSocketEvent);

    return () => {
      window.removeEventListener('social:socket', handleSocketEvent);
    };
  }, [profile.reload, posts.reload]);

  async function handleToggleFollow() {
    if (isFollowingBusy) return;

    setIsFollowingBusy(true);

    try {
      await request(
        `/users/${profileId}/follow`,
        isFollowing ? 'DELETE' : 'PUT',
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
    setOffset(0);
  }

  function handlePreviousPage() {
    setOffset(Math.max(0, offset - POSTS_PER_PAGE));
  }

  function handleNextPage() {
    setOffset(offset + POSTS_PER_PAGE);
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

              {/* Posts */}
              {posts.loading && <Loading />}

              {activeTab === 'media' ? (
                <MediaGrid posts={posts.data ?? []} />
              ) : (
                <PostList
                  posts={posts.data ?? []}
                  reload={posts.reload}
                />
              )}

              {/* Empty state */}
              {posts.data?.length === 0 && (
                <RequestState
                  empty={
                    activeTab === 'likes'
                      ? 'No liked posts yet.'
                      : 'No posts yet.'
                  }
                />
              )}

              {/* Pagination */}
              <Pagination
                offset={offset}
                hasNextPage={
                  !!posts.data &&
                  posts.data.length >= POSTS_PER_PAGE
                }
                onPrevious={handlePreviousPage}
                onNext={handleNextPage}
              />
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
      <div className="h-44 bg-linear-to-r from-blue-200 to-teal-100">
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
        <p className="text-sm text-slate-400">
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
  profileId: string;
  isFollowing: boolean;
  isFollowingBusy: boolean;
  onToggleFollow: () => void;
};

function ProfileActions({
  profileId,
  isFollowing,
  isFollowingBusy,
  onToggleFollow,
}: ProfileActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={isFollowingBusy}
        onClick={onToggleFollow}
        className="rounded-lg border border-blue-200 px-4 py-2 text-blue-700 disabled:opacity-50"
      >
        {isFollowingBusy
          ? 'Updating...'
          : isFollowing
            ? 'Unfollow'
            : 'Follow'}
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
  reload: () => void;
};

function PostList({
  posts,
  reload,
}: PostListProps) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.postId}
          post={post}
          fetchPosts={reload}
        />
      ))}
    </div>
  );
}

type MediaGridProps = {
  posts: Post[];
};

function MediaGrid({ posts }: MediaGridProps) {
  const media = posts.flatMap((post) =>
    (post.imageUrls || []).map((url) => ({
      url,
      postId: post.postId,
      title: post.title,
    })),
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {media.map((item) => (
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

type PaginationProps = {
  offset: number;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function Pagination({
  offset,
  hasNextPage,
  onPrevious,
  onNext,
}: PaginationProps) {
  const isFirstPage = offset === 0;

  return (
    <div className="flex justify-between text-sm">
      <button
        type="button"
        disabled={isFirstPage}
        onClick={onPrevious}
        className="disabled:opacity-40"
      >
        Previous
      </button>

      <button
        type="button"
        disabled={!hasNextPage}
        onClick={onNext}
        className="disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}