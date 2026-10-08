'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { type ChatMessage, type GroupMember, displayName, errorMessage, request, upload } from '../../../api/social';
import { usePagedList } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { useLiveRefresh } from '../../../lib/useLiveRefresh';
import Composer from '../Composer';
import MessageThread from '../MessageThread';
import { GROUP_PAGE_SIZE, isVideo, rsvpTally, type GroupItem } from './groupContent';
import { eventWhen } from './groupTime';
import GroupLightbox from './GroupLightbox';
import GroupRsvp from './GroupRsvp';

function toMessage(item: GroupItem): ChatMessage {
  return {
    messageId: item.id,
    senderId: item.userId,
    recipientId: '',
    textMessage: item.kind === 'events' ? '' : item.content,
    mediaUrl: item.mediaUrl,
    mediaType: item.mediaUrl ? (isVideo(item.mediaUrl) ? 'video' : 'image') : '',
    timeStamp: item.createdAt,
    isRead: 0,
    score: 0,
    userScore: 0,
    editedAt: '',
  };
}

export default function GroupChat({ groupId, meId, isOwner, onOpenEvents, onEdit }: {
  groupId: string;
  meId: string;
  isOwner: boolean;
  onOpenEvents: () => void;
  onEdit: (item: GroupItem) => void;
}) {
  const resource = usePagedList<GroupItem, GroupItem[]>({
    key: `/groups/${groupId}/content/timeline?parentId=0`,
    pageQuery: page => `&offset=${(page - 1) * GROUP_PAGE_SIZE}`,
    pageSize: GROUP_PAGE_SIZE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.id,
  });
  const members = useResource<GroupMember[]>(`/groups/${groupId}/members`);
  const [replyTo, setReplyTo] = useState<GroupItem | null>(null);
  const [viewer, setViewer] = useState<GroupItem | null>(null);
  const [answering, setAnswering] = useState(false);
  useLiveRefresh(resource.refresh, groupId);
  useLiveRefresh(members.reload, groupId);
  const byId = useMemo(() => new Map(resource.items.map(item => [item.id, item])), [resource.items]);
  const roster = useMemo(() => new Map((members.data ?? []).map(member => [member.userId, member])), [members.data]);
  const items = useMemo(() => resource.items.map(toMessage), [resource.items]);
  const richOf = useCallback((message: ChatMessage) => !!message.mediaUrl || byId.get(message.messageId)?.kind === 'events', [byId]);

  async function answer(item: GroupItem, status: string) {
    if (answering) return;
    setAnswering(true);
    try { await request(`/groups/${groupId}/events/${item.id}/rsvp`, 'PUT', { status }); resource.reload(); }
    catch (error) { toast.error(errorMessage(error)); } finally { setAnswering(false); }
  }

  async function remove(item: GroupItem) {
    const previous = resource.items;
    resource.update(items => items.filter(entry => entry.id !== item.id));
    try {
      await request(`/groups/${groupId}/content/${item.kind}/${item.id}?parentId=${item.parentId}`, 'DELETE');
    } catch (error) {
      resource.update(() => previous);
      toast.error(errorMessage(error));
    }
  }

  function embed(message: ChatMessage) {
    const item = byId.get(message.messageId);
    if (!item || item.kind !== 'events') return null;
    return <div className="grp-embed">
      <button
        type="button"
        className="grp-embed-btn"
        aria-label={`Open the Events tab for ${item.title || 'this event'}`}
        onClick={onOpenEvents}
      >
        <span className="grp-embed-eyebrow"><CalendarDays aria-hidden="true" />Event</span>
        <span className="grp-embed-title truncate" dir="auto">{item.title}</span>
        <span className="grp-embed-when">{eventWhen(item.startsAt)}</span>
        {item.content && <span className="grp-embed-text" dir="auto">{item.content}</span>}
      </button>
      <div className="grp-embed-foot">
        <span>{rsvpTally(item)}</span>
        {item.upcoming && <GroupRsvp item={item} busy={answering} onRsvp={(entry, status) => void answer(entry, status)} />}
      </div>
    </div>;
  }

  return <>
    {resource.settled && !resource.error && items.length === 0
      ? <div className="dm-empty">
        <span className="dm-empty-icon"><MessageCircle aria-hidden="true" /></span>
        <p className="dm-empty-title">No messages yet</p>
        <p className="dm-empty-text">Say hello to start the conversation.</p>
      </div>
      : <MessageThread
        items={items}
        meId={meId}
        partnerId=""
        partnerName="Member"
        partnerHandle=""
        partnerAvatar=""
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.reload}
        hasMore={resource.hasMore}
        loadingMore={resource.loadingMore}
        onLoadMore={resource.loadMore}
        typing={false}
        isGroup
        showIntro={false}
        allowReact={false}
        richOf={richOf}
        senderOf={userId => {
          const member = roster.get(userId);
          return { name: member ? displayName(member) : 'Member', avatar: member?.avatar ?? '' };
        }}
        embedOf={embed}
        onReact={() => {}}
        onDelete={messageId => { const item = byId.get(messageId); if (item) void remove(item); }}
        onEdit={message => { const item = byId.get(message.messageId); if (item) onEdit(item); }}
        onReply={message => { const item = byId.get(message.messageId); if (item) setReplyTo(item); }}
        onOpenMedia={images => setViewer(resource.items.find(entry => entry.mediaUrl === images[0]) ?? null)}
      />}
    <Composer
      placeholder="Message..."
      allowVideo
      replyTo={replyTo ? { name: replyTo.firstName || replyTo.nickname || 'a message', snippet: replyTo.content || 'Attachment' } : null}
      onCancelReply={() => setReplyTo(null)}
      onSend={async (text, file) => {
        const media = file ? await upload(file) : null;
        await request(`/groups/${groupId}/content/messages`, 'POST', { content: text, mediaUrl: media?.url || '' });
        setReplyTo(null);
        resource.refresh();
      }}
    />
    {viewer && <GroupLightbox
      items={[viewer]}
      index={0}
      meId={meId}
      isOwner={isOwner}
      avatarOf={userId => roster.get(userId)?.avatar ?? ''}
      onClose={() => setViewer(null)}
      onIndex={() => {}}
      onDelete={item => { void remove(item); setViewer(null); }}
    />}
  </>;
}
