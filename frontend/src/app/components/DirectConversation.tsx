'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { type ChatUser, type ChatMessage, type ConversationMedia, type SocketEvent, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import Lightbox from './Lightbox';
import ChatHeader from './messages/ChatHeader';
import DockHeader from './messages/DockHeader';
import MessageThread from './messages/MessageThread';
import Composer from './messages/Composer';
import DetailsPanel from './messages/DetailsPanel';

// `/messages` is capped at 10 rows per request by the backend.
const MESSAGES_PER_PAGE = 10;
// The details panel reads 30 attachments a request.
const MEDIA_PER_PAGE = 30;

/**
 * One direct conversation.
 *
 * It is the piece the redesign left in charge of behaviour only: the header, the thread,
 * the composer and the details column are their own components, and this owns the data —
 * the paged thread, the paged attachments, the socket's typing and read receipts, and the
 * writes (send, edit, delete, react, read) the endpoints already exposed.
 */
export default function DirectConversation({ partner, person, variant = 'page', onBack, onExpand, onClose, draft, onDraft }: {
  partner: string;
  person?: ChatUser;
  /** `dock` swaps the page header for the dock's and drops the details column, so the /messages
   *  page and the floating dock are one conversation with two skins, not two implementations. */
  variant?: 'page' | 'dock';
  onBack?: () => void;
  onExpand?: () => void;
  onClose?: () => void;
  draft?: string;
  onDraft?: (text: string) => void;
}) {
  const dock = variant === 'dock';
  const { user, connected, sendEvent } = useBackend();
  const thread = usePagedList<ChatMessage, { messages: ChatMessage[]; totalElements: number }>({
    // Newest first, so page 1 is the newest slice and "load more" walks backwards.
    key: `/messages?partnerId=${encodeURIComponent(partner)}`,
    pageQuery: page => `&offset=${(page - 1) * MESSAGES_PER_PAGE}`,
    pageSize: MESSAGES_PER_PAGE,
    normalize: (raw, { page, pageSize }) => ({ items: raw.messages, hasMore: page * pageSize < raw.totalElements }),
    keyOf: message => message.messageId,
  });
  const [details, setDetails] = useState(false);
  // The set the viewer was opened over: the details grid steps through one another, while
  // an attachment on a single bubble opens on its own.
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  // The details panel reads its own endpoint, and only while it is open, so a conversation
  // whose panel was never opened does not pay for it.
  const media = usePagedList<ConversationMedia, { media: ConversationMedia[]; totalElements: number }>({
    key: `/messages/media?partnerId=${encodeURIComponent(partner)}`,
    pageQuery: page => `&offset=${(page - 1) * MEDIA_PER_PAGE}`,
    pageSize: MEDIA_PER_PAGE,
    normalize: (raw, { page, pageSize }) => ({ items: raw.media, hasMore: page * pageSize < raw.totalElements }),
    keyOf: item => item.messageId,
    enabled: details,
  });
  const profile = useResource<ChatUser>(`/users/${encodeURIComponent(partner)}`, !person);
  const contact = person || profile.data;
  const name = contact ? displayName(contact) : 'Conversation';
  const handle = contact?.nickname ?? '';
  const avatar = contact?.avatar ?? '';
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  // Bumped when an edit starts, so the composer's draft is seeded from the message again.
  const [composerSeed, setComposerSeed] = useState(0);
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
    // Opening a thread marks the partner's side read, once, the way the endpoint expects.
    if (thread.items.some(message => message.recipientId === user.userId && !message.isRead)) {
      void request('/messages/read', 'POST', { partnerId: partner }).catch(error => toast.error(errorMessage(error)));
    }
  }, [thread.items, partner, user.userId]);

  async function send(text: string, file: File | null) {
    if (editing) await request(`/messages/${editing.messageId}`, 'PUT', { text });
    else {
      const uploaded = file ? await upload(file) : null;
      await request('/messages', 'POST', { recipientId: partner, text, mediaUrl: uploaded?.url || '', mediaType: uploaded?.mediaType || '' });
    }
    // Folding the newest page in keeps the history the reader already scrolled to.
    setEditing(null);
    setReplyTo(null);
    thread.refresh();
  }

  async function remove(id: number, scope: string) {
    if (busy) return;
    setBusy(true);
    // A hard reload: merging cannot drop the deleted row from the loaded pages.
    try { await request(`/messages/${id}?scope=${scope}`, 'DELETE'); thread.reload(); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function react(message: ChatMessage) {
    if (busy) return;
    setBusy(true);
    // Optimistic like the post arrows: the heart fills now and the server's total replaces
    // the guess when it answers. A failure puts the previous numbers back and says why.
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
    <div className={dock ? 'dm-panel dm-panel-dock' : 'dm-panel'}>
      {dock
        ? <DockHeader
          name={name}
          handle={handle}
          avatar={avatar}
          online={!!contact?.isOnline}
          profileHref={`/profile/${partner}`}
          onBack={() => onBack?.()}
          onExpand={() => onExpand?.()}
          onClose={() => onClose?.()}
        />
        : <ChatHeader
          name={name}
          handle={handle}
          avatar={avatar}
          online={!!contact?.isOnline}
          typing={typing}
          profileHref={`/profile/${partner}`}
          connected={connected}
          detailsOpen={details}
          onToggleDetails={() => setDetails(value => !value)}
        />}
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
        initialText={editing?.textMessage ?? (dock ? draft : undefined)}
        editing={!!editing}
        onCancel={() => setEditing(null)}
        replyTo={replyTo ? { name: 'your message', snippet: replyTo.textMessage || 'Attachment' } : null}
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
        onTyping={announceTyping}
        onDraft={onDraft}
        allowVideo
      />
    </div>
    {!dock && details && <DetailsPanel
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
