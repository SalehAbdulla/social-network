'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Send } from 'lucide-react';
import { type ChatUser, type ChatMessage, type Group, displayName, request } from '../api/social';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useSocketEvent } from '../lib/useSocketEvent';
import { messagesDock, useMessagesDock } from '../lib/messagesDock';
import { useBackend } from './BackendProvider';
import Avatar from './Avatar';
import DirectConversation from './DirectConversation';
import NewMessageModal from './messages/NewMessageModal';
import DockList from './messages/DockList';
import DockGroupChat from './messages/DockGroupChat';
import { type ConversationItem } from './messages/ConversationRow';
import { previewTime } from './messages/time';
import { memberCount } from './messages/group/groupContent';
import { DOCK_AVATAR_SIZE } from '../lib/sizing';

const PREVIEW_LIMIT = 8;
const PILL_AVATARS = 3;

interface Preview { text: string; mine: boolean; media: boolean; unread: boolean }

export default function MessagesDock() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, badges } = useBackend();
  const state = useMessagesDock();
  const target = state.target;
  const [composing, setComposing] = useState(false);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [pulse, setPulse] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const users = useResource<ChatUser[]>('/messages/users');
  const groups = useResource<Group[]>('/groups?scope=joined');
  useLiveRefresh(users.reload);
  useLiveRefresh(groups.reload);

  const conversations = useMemo(
    () => [...(users.data ?? [])].sort((a, b) => (b.lastMessageTime || '').localeCompare(a.lastMessageTime || '')),
    [users.data],
  );
  const joinedGroups = useMemo(
    () => [...(groups.data ?? [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [groups.data],
  );

  useEffect(() => {
    const people = conversations.slice(0, PREVIEW_LIMIT);
    if (!people.length) return;
    const abort = new AbortController();
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(people.map(async person => {
        try {
          const page = await request<{ messages: ChatMessage[] }>(`/messages?partnerId=${encodeURIComponent(person.userId)}&offset=0`, 'GET', undefined, abort.signal);
          const newest = page.messages[0];
          if (!newest) return [person.userId, null] as const;
          return [person.userId, {
            text: newest.textMessage?.trim() || '',
            mine: newest.senderId === user.userId,
            media: !!newest.mediaUrl,
            unread: newest.recipientId === user.userId && !newest.isRead,
          }] as const;
        } catch { return [person.userId, null] as const; }
      }));
      if (cancelled) return;
      setPreviews(current => {
        const next = { ...current };
        for (const [id, value] of entries) if (value) next[id] = value;
        return next;
      });
    })();
    return () => { cancelled = true; abort.abort(); };
  }, [conversations, user.userId]);

  useEffect(() => {
    if (state.open) panelRef.current?.focus();
    else pillRef.current?.focus();
  }, [state.open, state.target]);
  useEffect(() => {
    if (!state.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panelRef.current?.contains(event.target as Node)) messagesDock.close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state.open]);

  useSocketEvent('incoming_msg', () => {
    if (state.open) return;
    setPulse(true);
    window.setTimeout(() => setPulse(false), 700);
  });

  const hidden = pathname.startsWith('/messages') || searchParams.has('post');
  if (hidden) return null;

  function previewOf(personId: string): string {
    const preview = previews[personId];
    if (!preview) return '';
    const body = preview.media ? 'Sent an attachment.' : preview.text;
    if (!body) return '';
    return preview.mine ? `You: ${body}` : body;
  }

  const items: ConversationItem[] = [
    ...conversations.map(person => ({
      key: `dm:${person.userId}`,
      href: `/messages/${person.userId}`,
      name: displayName(person),
      avatar: <Avatar name={displayName(person)} avatarUrl={person.avatar} size={DOCK_AVATAR_SIZE} />,
      online: !!person.isOnline,
      preview: previewOf(person.userId),
      stamp: person.lastMessageTime ? previewTime(person.lastMessageTime) : '',
      unread: !!previews[person.userId]?.unread,
      onSelect: () => messagesDock.open({ kind: 'dm', id: person.userId }),
    })),
    ...joinedGroups.map(group => ({
      key: `group:${group.groupId}`,
      href: `/messages/groups/${group.groupId}`,
      name: group.title,
      avatar: <Avatar name={group.title} avatarUrl={group.imageUrl} size={DOCK_AVATAR_SIZE} />,
      preview: memberCount(group.memberCount),
      stamp: '',
      unread: false,
      onSelect: () => messagesDock.open({ kind: 'group', id: String(group.groupId) }),
    })),
  ];

  if (!state.open) {
    const unread = badges?.messages ?? 0;
    return <button
      ref={pillRef}
      type="button"
      className={`dock-pill${pulse ? ' dock-pulse' : ''}`}
      aria-label="Messages"
      aria-expanded={false}
      onClick={() => messagesDock.openList()}
    >
      <span className="dock-pill-icon">
        <Send aria-hidden="true" />
        {unread > 0 && <span className="dock-pill-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </span>
      <span className="dock-pill-label">Messages</span>
      {conversations.length > 0 && <span className="dock-pill-stack" aria-hidden="true">
        {conversations.slice(0, PILL_AVATARS).map(person => <span key={person.userId} className="dock-pill-face">
          <Avatar name={displayName(person)} avatarUrl={person.avatar} size={22} />
          {!!previews[person.userId]?.unread && <span className="dock-pill-dot" />}
        </span>)}
      </span>}
      {unread > 0 && <span className="sr-only">{unread} unread</span>}
    </button>;
  }

  return <div
    ref={panelRef}
    role="dialog"
    aria-label="Messages"
    tabIndex={-1}
    className="dock-panel"
    key={target ? `${target.kind}:${target.id}` : 'list'}
  >
    {target === null
      ? <DockList
        items={items}
        loading={users.loading}
        error={users.error}
        onRetry={users.reload}
        onExpand={() => { messagesDock.close(); router.push('/messages'); }}
        onClose={() => messagesDock.close()}
        onCompose={() => setComposing(true)}
      />
      : target.kind === 'dm'
        ? <DirectConversation
          key={target.id}
          partner={target.id}
          variant="dock"
          onBack={() => messagesDock.backToList()}
          onExpand={() => { messagesDock.close(); router.push(`/messages/${target.id}`); }}
          onClose={() => messagesDock.close()}
          draft={state.draft}
          onDraft={messagesDock.setDraft}
        />
        : <DockGroupChat
          groupId={target.id}
          onBack={() => messagesDock.backToList()}
          onExpand={() => { messagesDock.close(); router.push(`/messages/groups/${target.id}`); }}
          onClose={() => messagesDock.close()}
          onOpenGroup={() => { messagesDock.close(); router.push(`/groups/${target.id}`); }}
        />}
    {composing && <NewMessageModal meId={user.userId} onClose={() => setComposing(false)} onPick={id => messagesDock.open({ kind: 'dm', id })} />}
  </div>;
}
