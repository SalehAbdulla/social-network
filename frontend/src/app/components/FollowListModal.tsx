'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  type FollowLists,
  type SocialUser,
  type SocketEvent,
  displayName,
  errorMessage,
  request,
} from '../api/social';

import { useResource } from '../lib/useResource';
import { useBackend } from './BackendProvider';

import Avatar from './Avatar';
import Loading from './Loading';
import RequestState from './RequestState';

export type FollowListTab = 'followers' | 'following';

const TAB_LABELS: Record<FollowListTab, string> = {
  followers: 'Followers',
  following: 'Following',
};

type FollowListModalProps = {
  userId: string;
  initialTab: FollowListTab;
  close: () => void;
};

/**
 * Followers and following belong to the profile they are read from, so the
 * profile statistics open this dialog instead of navigating to a page.
 */
export default function FollowListModal({
  userId,
  initialTab,
  close,
}: FollowListModalProps) {
  const { user, refreshUser } = useBackend();

  const [tab, setTab] = useState<FollowListTab>(initialTab);
  const [busyId, setBusyId] = useState('');

  const people = useResource<FollowLists>(`/users/${userId}/follows`);
  const reload = people.reload;

  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const eventType = (event as CustomEvent<SocketEvent>).detail.type;

      if (eventType === 'social_changed' || eventType === 'connected') {
        reload();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('social:socket', handleSocketEvent);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('social:socket', handleSocketEvent);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [reload, close]);

  async function handleToggleFollow(personId: string) {
    if (busyId) return;

    setBusyId(personId);

    try {
      await request(
        `/users/${personId}/follow`,
        user.following.includes(personId) ? 'DELETE' : 'PUT',
      );

      await refreshUser();
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId('');
    }
  }

  const list = people.data?.[tab] ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Followers and following"
      onClick={close}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold">{TAB_LABELS[tab]}</h2>

          <button
            type="button"
            aria-label="Close followers and following"
            onClick={close}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-slate-200">
          {(['followers', 'following'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 px-4 py-3 text-sm font-medium ${
                tab === key
                  ? 'border-b-2 border-blue-600 text-blue-700'
                  : 'text-slate-500'
              }`}
            >
              {TAB_LABELS[key]} ({people.data?.[key].length || 0})
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {people.loading && <Loading height={80} />}

          <div className="space-y-2">
            {list.map((person) => (
              <FollowRow
                key={person.userId}
                person={person}
                isOwnEntry={person.userId === user.userId}
                isFollowing={user.following.includes(person.userId)}
                isBusy={busyId === person.userId}
                onToggleFollow={() => void handleToggleFollow(person.userId)}
                close={close}
              />
            ))}
          </div>

          {!people.loading && list.length === 0 && (
            <RequestState
              empty={
                tab === 'followers'
                  ? 'No followers yet.'
                  : 'Not following anyone yet.'
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

type FollowRowProps = {
  person: SocialUser;
  isOwnEntry: boolean;
  isFollowing: boolean;
  isBusy: boolean;
  onToggleFollow: () => void;
  close: () => void;
};

function FollowRow({
  person,
  isOwnEntry,
  isFollowing,
  isBusy,
  onToggleFollow,
  close,
}: FollowRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
      <Link
        href={`/profile/${person.userId}`}
        onClick={close}
        className="flex min-w-0 items-center gap-3"
      >
        <Avatar name={displayName(person)} avatarUrl={person.avatar} />

        <span className="min-w-0">
          <span className="block truncate font-medium">
            {displayName(person)}
          </span>

          <span className="block truncate text-sm text-slate-500">
            @{person.nickname}
          </span>
        </span>
      </Link>

      {!isOwnEntry && (
        <button
          type="button"
          disabled={isBusy}
          onClick={onToggleFollow}
          className="shrink-0 rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 disabled:opacity-50"
        >
          {isFollowing ? 'Unfollow' : 'Follow'}
        </button>
      )}
    </div>
  );
}
