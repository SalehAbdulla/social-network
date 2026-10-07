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
import { useDialogFocus } from '../lib/useDialogFocus';
import { useBackend } from './BackendProvider';

import Avatar from './Avatar';
import Button from './ui/Button';
import Loading from './Loading';

export type FollowListTab = 'followers' | 'following';

const TAB_LABELS: Record<FollowListTab, string> = {
  followers: 'Followers',
  following: 'Following',
};

/** A long list is the one that earns a search field; a handful of rows does not. */
const SEARCH_THRESHOLD = 8;
const AVATAR_SIZE = 44;

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

  // The drawer's keyboard contract for the other real overlay in the app: focus
  // moves to the close button, Tab cycles inside, Escape closes it.
  const dialog = useDialogFocus<HTMLDivElement>(close);

  const [tab, setTab] = useState<FollowListTab>(initialTab);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');

  const people = useResource<FollowLists>(`/users/${userId}/follows`);
  const reload = people.reload;

  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const eventType = (event as CustomEvent<SocketEvent>).detail.type;
      if (eventType === 'social_changed' || eventType === 'connected') reload();
    };
    window.addEventListener('social:socket', handleSocketEvent);
    return () => window.removeEventListener('social:socket', handleSocketEvent);
  }, [reload]);

  const list = people.data?.[tab] ?? [];

  async function handleToggleFollow(personId: string) {
    if (busyId) return;
    setBusyId(personId);
    try {
      const following = user.following.includes(personId) || !!list.find(person => person.userId === personId)?.pendingOutgoing;
      await request(`/users/${personId}/follow`, following ? 'DELETE' : 'PUT');
      await refreshUser();
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId('');
    }
  }

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? list.filter(person => `${displayName(person)} ${person.nickname}`.toLowerCase().includes(needle))
    : list;

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Followers and following"
      className="follow-scrim"
      onClick={close}
    >
      <div className="follow-card" onClick={(event) => event.stopPropagation()}>
        <div className="follow-head">
          <h2 className="follow-title">{TAB_LABELS[tab]}</h2>
          <button
            type="button"
            aria-label="Close followers and following"
            onClick={close}
            className="ui-icon-btn"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="flex" role="group" aria-label="Followers and following">
          {(['followers', 'following'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => { setTab(key); setQuery(''); }}
              className={`flex-1 border-b-2 py-3 text-sm font-semibold ${
                tab === key ? 'border-text text-text' : 'border-transparent text-muted'
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        {list.length > SEARCH_THRESHOLD && (
          <div className="follow-search">
            <input
              type="search"
              aria-label={`Search ${TAB_LABELS[tab]}`}
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}

        <div className="follow-body">
          {people.loading && <Loading height={80} />}
          {shown.map((person) => (
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
          {!people.loading && shown.length === 0 && (
            <p className="follow-handle" style={{ padding: 16, textAlign: 'center' }}>
              {needle
                ? 'No results found.'
                : tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
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
    <div className="follow-row">
      <Link
        href={`/profile/${person.userId}`}
        onClick={close}
        className="follow-user min-w-0"
      >
        <Avatar name={displayName(person)} avatarUrl={person.avatar} size={AVATAR_SIZE} />
        <span className="min-w-0">
          <span className="follow-name block truncate" dir="auto">{displayName(person)}</span>
          <span className="follow-handle block truncate" dir="auto">@{person.nickname}</span>
        </span>
      </Link>

      {!isOwnEntry && (
        <Button
          variant={isFollowing ? 'secondary' : 'primary'}
          className="profile-btn"
          loading={isBusy}
          disabled={person.pendingIncoming && !isFollowing}
          title={person.pendingOutgoing ? 'Cancel follow request' : person.pendingIncoming ? 'Review this request in Notifications' : undefined}
          onClick={onToggleFollow}
        >
          {isFollowing ? 'Following' : person.pendingOutgoing ? 'Requested' : 'Follow'}
        </Button>
      )}
    </div>
  );
}

