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
import { mediaImageProps } from '../lib/mediaVariants';

import Avatar from '../components/Avatar';
import ChangePassword from '../components/ChangePassword';
import EditProfile from '../components/EditProfile';
import FollowListModal, {
  type FollowListTab,
} from '../components/FollowListModal';
import Loading from '../components/Loading';
import LoadMore from '../components/LoadMore';
import MessageAction from '../components/MessageAction';
import PostCard from '../components/PostCard';
import { StoryArchive } from '../components/StoriesBar';
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
  // The follow control flips before the server answers. `isFollowing` is global
  // state and `pendingOutgoing` belongs to the fetched profile, so the intent is
  // held here until the refreshed values replace it — and it is three states rather
  // than one because a follow on a private profile is a request, not a follow.
  const [followIntent, setFollowIntent] = useState<'following' | 'requested' | 'none' | null>(null);
  const followState = followIntent
    ?? (isFollowing ? 'following' : profile.data?.pendingOutgoing ? 'requested' : 'none');

  const canViewProfile =
    isOwnProfile ||
    !!profile.data?.isPublic ||
    followState === 'following';


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
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [followListTab, setFollowListTab] = useState<FollowListTab | null>(null);
  const [isFollowingBusy, setIsFollowingBusy] = useState(false);

  const closeFollowList = useCallback(() => setFollowListTab(null), []);

  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const socketEvent = event as CustomEvent<SocketEvent>;
      const eventType = socketEvent.detail.type;

      if (eventType === 'social_changed' || eventType === 'connected') {
        // The follow endpoints push this event to the target *and* to the actor
        // (`chatEvent(actor, target, …)`, carrying both ids). For the actor it is
        // the echo of a click whose result this page has already applied, so
        // re-reading the post and media lists here would undo the point of doing it
        // optimistically. A reconnect still reloads everything, because events were
        // missed while the socket was down.
        if (eventType === 'social_changed' && socketEvent.detail.payload?.actorId === user.userId) return;
        profile.reload();
        posts.reload();
        media.reload();
      }
    };

    window.addEventListener('social:socket', handleSocketEvent);

    return () => {
      window.removeEventListener('social:socket', handleSocketEvent);
    };
  }, [profile.reload, posts.reload, media.reload, user.userId]);

  async function handleToggleFollow() {
    if (isFollowingBusy) return;

    setIsFollowingBusy(true);

    const cancels = followState === 'following' || followState === 'requested';
    // A follow on a private profile becomes a request, which grants nothing yet.
    const intent: 'following' | 'requested' | 'none' = cancels
      ? 'none'
      : profile.data?.isPublic === false ? 'requested' : 'following';
    // Only following or unfollowing a private profile changes what this viewer may
    // read, so that is the only case that re-reads the posts.
    const reloadsPosts = profile.data?.isPublic === false && intent !== 'requested';
    setFollowIntent(intent);

    try {
      await request(
        `/users/${profileId}/follow`,
        cancels ? 'DELETE' : 'PUT',
      );

      // The counts are single small resources this page displays, so they are still
      // re-read; the post list is not, which is the refetch this change removes.
      await refreshUser();
      profile.reload();
      if (reloadsPosts) posts.reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setFollowIntent(null);
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
            isFollowing={followState === 'following'}
            pendingOutgoing={followState === 'requested'}
            isFollowingBusy={isFollowingBusy}
            onEdit={() => setIsEditing(true)}
            onChangePassword={() => setIsChangingPassword(true)}
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
          {/* Change password — the backend rotates the session, so nothing here
              has to refresh the signed-in user afterwards. */}
          {isChangingPassword && (
            <ChangePassword close={() => setIsChangingPassword(false)} />
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
  pendingOutgoing: boolean;
  isFollowingBusy: boolean;
  onEdit: () => void;
  onChangePassword: () => void;
  onToggleFollow: () => void;
  canOpenFollowLists: boolean;
  onOpenFollowList: (tab: FollowListTab) => void;
};

function ProfileHeader({
  profile,
  currentUser,
  isOwnProfile,
  isFollowing,
  pendingOutgoing,
  isFollowingBusy,
  onEdit,
  onChangePassword,
  onToggleFollow,
  canOpenFollowLists,
  onOpenFollowList,
}: ProfileHeaderProps) {
  const profileOwner = isOwnProfile ? currentUser : profile;
  // The author's own expired stories live here now, not in the feed's strip: the profile is where a
  // member's own content belongs, and the strip is for what is still live.
  const [archiveOpen, setArchiveOpen] = useState(false);

  return <>
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
        {/* Instagram shape: the avatar on the left, with the handle, the actions and the
            counts stacked on the right, and the name and bio below the pair. On a phone the
            same row simply narrows. */}
        <div className="flex items-center gap-6 sm:items-start">
          <Avatar
            name={displayName(profile)}
            avatarUrl={profile.avatar}
            size={80}
          />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold text-slate-800">
                @{profile.nickname}
              </p>

              {isOwnProfile ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onEdit}
                    className="rounded-lg border border-slate-200 px-4 py-2"
                  >
                    Edit profile
                  </button>
                  <button
                    type="button"
                    onClick={onChangePassword}
                    className="rounded-lg border border-slate-200 px-4 py-2"
                  >
                    Change password
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveOpen(true)}
                    className="rounded-lg border border-slate-200 px-4 py-2"
                  >
                    Your archive
                  </button>
                </div>
              ) : (
                <ProfileActions
                  pendingOutgoing={pendingOutgoing}
                  pendingIncoming={profile.pendingIncoming}
                  canMessage={profile.canMessage === true}
                  isFollowing={isFollowing}
                  isFollowingBusy={isFollowingBusy}
                  profileId={profile.userId}
                  onToggleFollow={onToggleFollow}
                />
              )}
            </div>

            {/* Statistics. The post count is its own labelled element; the followers and
                following pair keeps the `Profile statistics` label it had, so the new count
                is readable without changing what that row already answers. */}
            <div className="flex flex-wrap gap-5 text-sm">
              {/* The post count comes from this profile's own resource rather than from
                  `profileOwner`: the provider's copy of the signed-in user is only re-read
                  after a follow, so it would be stale here after writing a post, while this
                  resource is fetched whenever the page is opened. */}
              <span aria-label="Post count">
                <b>{profile.postCount}</b> posts
              </span>

              <div aria-label="Profile statistics" className="flex flex-wrap gap-5">
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
          </div>
        </div>

        {/* Name, bio and meta */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {displayName(profile)}
          </h1>

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
        </div>
      </div>
    </section>
    {archiveOpen && <StoryArchive close={() => setArchiveOpen(false)} />}
  </>;
}

type ProfileActionsProps = {
  pendingOutgoing: boolean;
  pendingIncoming: boolean;
  canMessage: boolean;
  profileId: string;
  isFollowing: boolean;
  isFollowingBusy: boolean;
  onToggleFollow: () => void;
};

function ProfileActions({
  pendingOutgoing,
  pendingIncoming,
  canMessage,
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

      <MessageAction
        userId={profileId}
        allowed={canMessage}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white"
      />
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
    <div data-media-grid className="grid grid-cols-3 gap-1">
      {items.map((item) => (
        <Link
          key={`${item.postId}-${item.url}`}
          href={`/post/${item.postId}`}
          className="group relative block overflow-hidden bg-slate-100"
        >
          <img
            {...mediaImageProps(item.url, '(max-width: 640px) 33vw, 320px')}
            alt={item.title}
            className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105"
          />
        </Link>
      ))}
    </div>
  );
}
