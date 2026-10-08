'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Camera, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  type MediaItem,
  type Page,
  type Post,
  type SocialUser,
  type SocketEvent,
  type Story,
  errorMessage,
  request,
} from '../api/social';

import { useBackend } from '../components/BackendProvider';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { useMediaQuery } from '../lib/useMediaQuery';
import { authorHasUnseen, firstUnseenIndex } from '../lib/storySequence';

import Button from '../components/ui/Button';
import ChangePassword from '../components/ChangePassword';
import EditProfile from '../components/EditProfile';
import FollowListModal, { type FollowListTab } from '../components/FollowListModal';
import Loading from '../components/Loading';
import { usePostModal } from '../lib/usePostModal';
import { useCreatePost } from '../lib/useCreatePost';
import { StoryArchive } from '../components/StoriesBar';
import ProfileHeader, { type FollowState } from '../components/profile/ProfileHeader';
import ProfileTabs, { type ProfileTab } from '../components/profile/ProfileTabs';
import PostGrid, { MediaGrid } from '../components/profile/PostGrid';

const POSTS_PER_PAGE = 20;
const OWN_TABS: ProfileTab[] = ['posts', 'media', 'likes', 'saved'];
const OTHER_TABS: ProfileTab[] = ['posts', 'media'];

export default function Profile() {
  const { user, refreshUser } = useBackend();
  const params = useParams<{ profileId?: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const profileId = params.profileId || user.userId;
  const profile = useResource<SocialUser>(`/users/${profileId}`);
  const isOwnProfile = profileId === user.userId;
  const isFollowing = user.following.includes(profileId);

  const [followIntent, setFollowIntent] = useState<FollowState | null>(null);
  const followState: FollowState = followIntent
    ?? (isFollowing ? 'following' : profile.data?.pendingOutgoing ? 'requested' : 'none');
  const canViewProfile = isOwnProfile || !!profile.data?.isPublic || followState === 'following';

  const tabs = isOwnProfile ? OWN_TABS : OTHER_TABS;
  const requested = searchParams.get('tab') as ProfileTab | null;
  const activeTab: ProfileTab = requested && tabs.includes(requested) ? requested : 'posts';

  const isWide = useMediaQuery('(min-width: 900px)');
  const isTablet = useMediaQuery('(min-width: 736px)');
  const avatarSize = isWide ? 150 : isTablet ? 110 : 77;

  const stories = useResource<Story[]>('/stories');
  const profileStories = useMemo(
    () => (stories.data ?? []).filter(story => story.userId === profileId).sort((a, b) => a.storyId - b.storyId),
    [stories.data, profileId],
  );
  const hasStories = profileStories.length > 0;

  const posts = usePagedList<Post, Post[]>({
    key: `/users/${profileId}/posts?liked=${activeTab === 'likes'}`,
    pageQuery: page => `&offset=${(page - 1) * POSTS_PER_PAGE}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: post => post.postId,
    enabled: !!profile.data && canViewProfile && (activeTab === 'posts' || activeTab === 'likes'),
  });

  const saved = usePagedList<Post, Page<Post>>({
    key: `/saved-posts?size=${POSTS_PER_PAGE}`,
    pageQuery: page => `&page=${page}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw.posts, hasMore: !raw.lastPage }),
    keyOf: post => post.postId,
    enabled: isOwnProfile && canViewProfile && activeTab === 'saved',
  });

  const create = useCreatePost({
    onShared: post => { if (post) posts.update(items => [post, ...items]); },
  });

  const media = usePagedList<MediaItem, MediaItem[]>({
    key: `/users/${profileId}/media`,
    pageQuery: page => `?offset=${(page - 1) * POSTS_PER_PAGE}`,
    pageSize: POSTS_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: item => `${item.postId}-${item.url}`,
    enabled: !!profile.data && canViewProfile && activeTab === 'media',
  });

  const list = activeTab === 'saved' ? saved : posts;

  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [followListTab, setFollowListTab] = useState<FollowListTab | null>(null);
  const [isFollowingBusy, setIsFollowingBusy] = useState(false);

  const closeFollowList = useCallback(() => setFollowListTab(null), []);

  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const socketEvent = event as CustomEvent<SocketEvent>;
      const eventType = socketEvent.detail.type;
      if (eventType === 'social_changed' || eventType === 'connected') {
        if (eventType === 'social_changed' && socketEvent.detail.payload?.actorId === user.userId) return;
        profile.reload();
        posts.reload();
        media.reload();
        saved.reload();
      }
    };
    window.addEventListener('social:socket', handleSocketEvent);
    return () => window.removeEventListener('social:socket', handleSocketEvent);
  }, [profile.reload, posts.reload, media.reload, saved.reload, user.userId]);

  async function handleToggleFollow() {
    if (isFollowingBusy) return;
    setIsFollowingBusy(true);
    const cancels = followState === 'following' || followState === 'requested';
    const intent: FollowState = cancels
      ? 'none'
      : profile.data?.isPublic === false ? 'requested' : 'following';
    const reloadsPosts = profile.data?.isPublic === false && intent !== 'requested';
    setFollowIntent(intent);
    try {
      await request(`/users/${profileId}/follow`, cancels ? 'DELETE' : 'PUT');
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

  function changeTab(tab: ProfileTab) {
    router.push(`${pathname}?tab=${tab}`, { scroll: false });
  }

  function openStories() {
    const story = profileStories[firstUnseenIndex(profileStories)];
    if (story) router.push(`/stories/${story.nickname}/${story.storyId}`);
  }

  function removePost(postId: string) {
    posts.update(items => items.filter(item => item.postId !== postId));
    saved.update(items => items.filter(item => item.postId !== postId));
  }

  const followers = (isOwnProfile ? user.followers : profile.data?.followers ?? []).length;
  const following = (isOwnProfile ? user.following : profile.data?.following ?? []).length;

  const gridPosts = activeTab === 'saved' ? saved.items : posts.items;
  const { openFor, modal } = usePostModal(gridPosts, removePost);

  const empty = activeTab === 'likes'
    ? <GridEmpty text="Posts you like will appear here." />
    : activeTab === 'saved'
      ? <GridEmpty text="Save posts to see them here. Only you can see what you've saved." />
      : activeTab === 'media'
        ? <GridEmpty text="No media yet." />
        : isOwnProfile
          ? <PhotosEmpty onShare={create.open} />
          : <GridEmpty text="No posts yet." />;


  return <div className="profile-page">
    <div className="profile">
    {profile.loading && <Loading />}
    {!!profile.error && <p className="profile-error" role="alert">{profile.error}</p>}

    {profile.data && <>
      <ProfileHeader
        profile={profile.data}
        followers={followers}
        following={following}
        isOwner={isOwnProfile}
        avatarSize={avatarSize}
        followState={followState}
        canMessage={profile.data.canMessage === true}
        isFollowingBusy={isFollowingBusy}
        hasStories={hasStories}
        storyUnseen={authorHasUnseen(profileStories)}
        onAvatarClick={() => setIsEditing(true)}
        onOpenStories={openStories}
        onEdit={() => setIsEditing(true)}
        onArchive={() => setArchiveOpen(true)}
        onChangePassword={() => setIsChangingPassword(true)}
        onOpenFollows={setFollowListTab}
        onToggleFollow={() => void handleToggleFollow()}
      />

      {canViewProfile ? <>
        <div className="profile-tabs-wrap"><ProfileTabs tabs={tabs} value={activeTab} onChange={changeTab} label="Profile" /></div>
        {activeTab === 'media'
          ? <MediaGrid items={media.items} loading={media.loading} error={media.error} settled={media.settled} hasMore={media.hasMore} loadingMore={media.loadingMore} onLoadMore={media.loadMore} onRetry={media.reload} empty={empty} />
          : <PostGrid posts={list.items} loading={list.loading} error={list.error} settled={list.settled} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.loadMore} onRetry={list.reload} onOpen={post => openFor(post)()} empty={empty} />}
      </> : <div className="profile-empty">
        <span className="profile-empty-icon"><Lock aria-hidden="true" /></span>
        <div className="profile-empty-copy">
          <p className="profile-empty-title">This account is private</p>
          <p className="profile-empty-text">Follow this account to see their photos and videos.</p>
        </div>
      </div>}

      {modal}
      {create.modal}

      {isEditing && <EditProfile profile={profile.data} close={() => setIsEditing(false)} saved={profile.reload} />}
      {isChangingPassword && <ChangePassword close={() => setIsChangingPassword(false)} />}
      {archiveOpen && <StoryArchive close={() => setArchiveOpen(false)} />}
      {followListTab && <FollowListModal userId={profile.data.userId} initialTab={followListTab} close={closeFollowList} />}
    </>}
    </div>
  </div>;
}

function GridEmpty({ text }: { text: string }) {
  return <div className="profile-empty"><p className="profile-empty-text">{text}</p></div>;
}

function PhotosEmpty({ onShare }: { onShare: () => void }) {
  return <div className="profile-empty">
    <span className="profile-empty-icon"><Camera aria-hidden="true" /></span>
    <div className="profile-empty-copy">
      <p className="profile-empty-title">Share photos</p>
      <p className="profile-empty-text">When you share photos, they will appear on your profile.</p>
      <Button variant="text" onClick={onShare}>Share your first photo</Button>
    </div>
  </div>;
}

