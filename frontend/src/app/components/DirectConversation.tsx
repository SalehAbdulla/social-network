'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { type ChatUser, type ChatMessage, type ConversationMedia, type SocialUser, type SocketEvent, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useMediaDrop } from '../lib/useMediaDrop';
import Avatar from './Avatar';
import Lightbox from './Lightbox';
import { messageBlockedReason } from './MessageAction';
import ChatHeader from './messages/ChatHeader';
import DockHeader from './messages/DockHeader';
import MessageThread from './messages/MessageThread';
import Composer, { type ComposerHandle } from './messages/Composer';
import DetailsPanel from './messages/DetailsPanel';

const MESSAGES_PER_PAGE = 10;
const MEDIA_PER_PAGE = 30;

export default function DirectConversation({ partner, person, variant = 'page', onBack, onExpand, onClose, draft, onDraft }: {
  partner: string;
  person?: ChatUser;
  variant?: 'page' | 'dock';
  onBack?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  draft?: string;
  onDraft?: (text: string) => void;
}) {
  const dock = variant === 'dock';
  const { user, connected, sendEvent } = useBackend();
  const profile = useResource<SocialUser>(`/users/${encodeURIComponent(partner)}`, !person);
  const contact = person || profile.data;
  // Presence only rides on the inbox's own list; a profile read carries none.
  const online = !!person?.isOnline;
  // A conversation the rule refuses is answered by the server with a 403, so the
  // thread is not even requested: the panel says why instead, and the browser
  // console stays clean.
  const blocked = !person && profile.data?.canMessage === false;
  const thread = usePagedList<ChatMessage, { messages: ChatMessage[]; totalElements: number }>({
    key: `/messages?partnerId=${encodeURIComponent(partner)}`,
    pageQuery: page => `&offset=${(page - 1) * MESSAGES_PER_PAGE}`,
    pageSize: MESSAGES_PER_PAGE,
    normalize: (raw, { page, pageSize }) => ({ items: raw.messages, hasMore: page * pageSize < raw.totalElements }),
    keyOf: message => message.messageId,
    enabled: !blocked,
  });
  const [details, setDetails] = useState(false);
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  const media = usePagedList<ConversationMedia, { media: ConversationMedia[]; totalElements: number }>({
    key: `/messages/media?partnerId=${encodeURIComponent(partner)}`,
    pageQuery: page => `&offset=${(page - 1) * MEDIA_PER_PAGE}`,
    pageSize: MEDIA_PER_PAGE,
    normalize: (raw, { page, pageSize }) => ({ items: raw.media, hasMore: page * pageSize < raw.totalElements }),
    keyOf: item => item.messageId,
    enabled: details && !blocked,
  });
  const name = contact ? displayName(contact) : 'Conversation';
  const handle = contact?.nickname ?? '';
  const avatar = contact?.avatar ?? '';
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [composerSeed, setComposerSeed] = useState(0);
  const composer = useRef<ComposerHandle>(null);
  // The whole panel is the drop zone, so a file can be let go on the thread or on the pill; the
  // composer owns what happens to it next. Neither an edit nor a conversation the chat rule refuses
  // can take a photo, so the zone stays dark there.
  const drop = useMediaDrop({ enabled: !blocked && !editing, onFiles: files => composer.current?.attach(files) });
  useLiveRefresh(thread.refresh);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const listener = (event: Event) => {
      const message = (event as CustomEvent<SocketEvent>).detail;
      if (message.payload?.senderId !== partner) return;
      if (message.type === 'typing') { setTyping(true); clearTimeout(timer); timer = setTimeout(() => setTyping(false), 3000); }
      if (message.type === 'typing_stopped') { setTyping(false); clearTimeout(timer); }
    };
    window.addEventListener('social:socket', listener);
    return () => { clearTimeout(timer); window.removeEventListener('social:socket', listener); };
  }, [partner]);

  useEffect(() => {
    if (!connected) return;
    sendEvent({ type: 'open_chat', payload: { partnerId: partner } });
    return () => { sendEvent({ type: 'close_chat', payload: {} }); };
  }, [connected, partner, sendEvent]);

  useEffect(() => {
    if (thread.items.some(message => message.recipientId === user.userId && !message.isRead)) {
      void request('/messages/read', 'POST', { partnerId: partner }).catch(error => toast.error(errorMessage(error)));
    }
  }, [thread.items, partner, user.userId]);

  async function send(text: string, file: File | null) {
    if (editing) await request(`/messages/${editing.messageId}`, 'PUT', { text });
    else {
      const uploaded = file ? await upload(file) : null;
      await request('/messages', 'POST', { recipientId: partner, text, mediaUrl: uploaded?.url || '', mediaType: uploaded?.mediaType || '', replyToId: replyTo?.messageId ?? 0 });
    }
    setEditing(null);
    setReplyTo(null);
    thread.refresh();
  }

  async function remove(id: number, scope: string) {
    if (busy) return;
    setBusy(true);
    try { await request(`/messages/${id}?scope=${scope}`, 'DELETE'); thread.reload(); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function react(message: ChatMessage) {
    if (busy) return;
    setBusy(true);
    const previous = { score: message.score, userScore: message.userScore };
    const userScore = message.userScore === 1 ? 0 : 1;
    thread.update(items => items.map(item => item.messageId === message.messageId
      ? { ...item, score: item.score + (userScore - item.userScore), userScore } : item));
    try {
      const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: 'message', entityId: message.messageId, score: 1 });
      thread.update(items => items.map(item => item.messageId === message.messageId ? { ...item, score: result.totalScore, userScore } : item));
    } catch (error) {
      thread.update(items => items.map(item => item.messageId === message.messageId ? { ...item, ...previous } : item));
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }

  function beginReply(message: ChatMessage) {
    setEditing(null);
    setReplyTo(message);
  }

  function beginEdit(message: ChatMessage) {
    setReplyTo(null);
    setEditing(message);
    setComposerSeed(value => value + 1);
  }

  function announceTyping(isTyping: boolean) {
    sendEvent({ type: isTyping ? 'typing' : 'typing_stopped', payload: { senderId: user.userId, recipientId: partner } });
  }

  return <>
    <div className={dock ? 'dm-panel dm-panel-dock' : 'dm-panel'} {...drop.dropProps}>
      {dock
        ? <DockHeader
          name={name}
          handle={handle}
          avatar={avatar}
          online={online}
          profileHref={`/profile/${partner}`}
          onBack={() => onBack?.()}
          onExpand={() => onExpand?.()}
          onClose={() => onClose?.()}
        />
        : <ChatHeader
          name={name}
          handle={handle}
          avatar={avatar}
          online={online}
          typing={typing}
          profileHref={`/profile/${partner}`}
          connected={connected}
          detailsOpen={details}
          onToggleDetails={() => setDetails(value => !value)}
        />}
      {blocked
        ? <BlockedChat name={name} avatar={avatar} partner={partner} />
        : <>
          <MessageThread
            items={thread.items}
            meId={user.userId}
            partnerId={partner}
            partnerName={name}
            partnerHandle={handle}
            partnerAvatar={avatar}
            loading={thread.loading}
            error={thread.error}
            onRetry={thread.reload}
            hasMore={thread.hasMore}
            loadingMore={thread.loadingMore}
            onLoadMore={thread.loadMore}
            typing={typing}
            showIntro={!dock}
            onReact={message => void react(message)}
            onDelete={(id, scope) => void remove(id, scope)}
            onEdit={beginEdit}
            onReply={beginReply}
            onOpenMedia={(images, index) => setViewer({ images, index })}
          />
          <Composer
            key={`${editing?.messageId ?? 'new'}-${composerSeed}`}
            ref={composer}
            initialText={editing?.textMessage ?? (dock ? draft : undefined)}
            editing={!!editing}
            onCancel={() => setEditing(null)}
            replyTo={replyTo ? { name: replyTo.senderId === user.userId ? 'your message' : name, snippet: replyTo.textMessage || 'Attachment' } : null}
            onCancelReply={() => setReplyTo(null)}
            onSend={send}
            onTyping={announceTyping}
            onDraft={onDraft}
            allowVideo
            dropping={drop.dropping}
          />
        </>}
    </div>
    {!dock && details && !blocked && <DetailsPanel
      name={name}
      avatar={avatar}
      href={`/profile/${partner}`}
      handle={handle}
      media={media.items}
      mediaLoading={media.loading}
      mediaError={media.error}
      mediaHasMore={media.hasMore}
      onLoadMoreMedia={media.loadMore}
      onRetryMedia={media.reload}
      onOpenMedia={(images, index) => setViewer({ images, index })}
      onClose={() => setDetails(false)}
    />}
    {viewer && <Lightbox images={viewer.images} startIndex={viewer.index} label="Conversation media" onClose={() => setViewer(null)} />}
  </>;
}

// The panel shown when the chat rule refuses the conversation: the reason, the
// member it is about, and the way to unlock it.
function BlockedChat({ name, avatar, partner }: { name: string; avatar: string; partner: string }) {
  return <div className="dm-empty">
    <span className="dm-header-avatar"><Avatar name={name} avatarUrl={avatar} size={72} /></span>
    <h1 className="dm-empty-title">{name}</h1>
    <p className="dm-empty-text">{messageBlockedReason}</p>
    <Link href={`/profile/${partner}`} className="dm-primary">View profile</Link>
  </div>;
}
