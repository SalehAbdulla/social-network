'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { type ChatUser, type ChatMessage, type SocketEvent, dateLabel, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import Avatar from './Avatar';
import ChatComposer from './ChatComposer';
import Pagination from './Pagination';
import Loading from './Loading';

export default function DirectConversation({ partner, person }: { partner: string; person?: ChatUser }) {
  const { user, connected, sendEvent } = useBackend();
  const [page, setPage] = useState(1);
  const thread = useResource<{ messages: ChatMessage[]; totalElements: number }>(`/messages?partnerId=${encodeURIComponent(partner)}&offset=${(page - 1) * 10}`);
  const profile = useResource<ChatUser>(`/users/${encodeURIComponent(partner)}`, !person);
  const contact = person || profile.data;
  const name = contact ? displayName(contact) : 'Conversation';
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  useLiveRefresh(thread.reload);
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
    if (page === 1 && nearBottom.current) bottom.current?.scrollIntoView({ block: 'nearest' });
    if (thread.data?.messages.some(message => message.recipientId === user.userId && !message.isRead)) {
      void request('/messages/read', 'POST', { partnerId: partner }).catch(error => toast.error(errorMessage(error)));
    }
  }, [thread.data, page, partner, user.userId]);
  async function send(text: string, file: File | null) {
    if (editing) await request(`/messages/${editing.messageId}`, 'PUT', { text });
    else {
      const media = file ? await upload(file) : null;
      await request('/messages', 'POST', { recipientId: partner, text, mediaUrl: media?.url || '', mediaType: media?.mediaType || '' });
    }
    nearBottom.current = true; setEditing(null); setPage(1); thread.reload();
  }
  async function remove(id: number, scope: string) {
    if (busy) return; setBusy(true);
    try { await request(`/messages/${id}?scope=${scope}`, 'DELETE'); thread.reload(); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <section className="flex h-full min-h-0 flex-1 flex-col" aria-label={`Chat with ${name}`}>
    <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-4">
      <Link href="/messages" aria-label="Back to conversations" className="chat-icon md:hidden"><ArrowLeft size={20} /></Link>
      <Link href={`/profile/${partner}`} className="flex min-w-0 items-center gap-3"><Avatar name={name} avatarUrl={contact?.avatar} /><div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{name}</h2><p className="text-xs text-slate-500">{typing ? 'Typing…' : person?.isOnline ? 'Online' : 'Offline'}</p></div></Link>
      <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-400'}`} title={connected ? 'Connected' : 'Reconnecting'} />
    </header>
    <div ref={scroller} onScroll={() => { const el = scroller.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }} className="chat-background min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      {(page > 1 || (thread.data?.totalElements || 0) > 10) && <div className="mb-5"><Pagination label="Message history" page={page} totalPages={Math.ceil((thread.data?.totalElements || 0) / 10)} loading={thread.loading} hasNext={page * 10 < (thread.data?.totalElements || 0)} onChange={next => { nearBottom.current = next === 1; setPage(next); }} /></div>}
      {thread.loading && <Loading height={80} />}
      {thread.error && <button className="chat-secondary" onClick={thread.reload}>Retry loading messages</button>}
      {thread.data?.messages.length === 0 && <p className="py-12 text-center text-sm text-slate-500">Say hello to {name}. This is the start of your conversation.</p>}
      <div className="space-y-4">{[...(thread.data?.messages || [])].reverse().map(message => {
        const mine = message.senderId === user.userId;
        return <div key={message.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><article className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[75%] ${mine ? 'rounded-br-sm bg-teal-700 text-white' : 'rounded-bl-sm border border-slate-100 bg-white text-slate-800'}`}>
          {message.mediaUrl && (message.mediaType === 'video' ? <video src={message.mediaUrl} controls className="mb-2 max-h-80 rounded-xl" /> : <a href={message.mediaUrl} target="_blank" rel="noreferrer"><img src={message.mediaUrl} alt="Message attachment" className="mb-2 max-h-80 rounded-xl object-contain" /></a>)}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.textMessage}</p>
          <div className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-teal-100' : 'text-slate-400'}`}><time>{dateLabel(message.timeStamp)}</time>{message.editedAt && <span>· edited</span>}{mine && (message.isRead ? <CheckCheck size={14} aria-label="Read" /> : <Check size={14} aria-label="Sent" />)}
            <details className="relative ml-2"><summary aria-label="Message actions" className="cursor-pointer list-none px-1 text-sm">•••</summary><div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-lg">{mine && <><button className="chat-menu" disabled={busy} onClick={() => setEditing(message)}>Edit message</button><button className="chat-menu text-red-600" disabled={busy} onClick={() => void remove(message.messageId, 'everyone')}>Delete for everyone</button></>}<button className="chat-menu" disabled={busy} onClick={() => void remove(message.messageId, 'me')}>Delete for me</button></div></details>
          </div>
        </article></div>;
      })}</div><div ref={bottom} />
    </div>
    <ChatComposer allowVideo key={editing?.messageId || 'new'} initialText={editing?.textMessage} editing={!!editing} onCancel={() => setEditing(null)} onSend={send} onTyping={active => sendEvent({ type: active ? 'typing' : 'typing_stopped', payload: { senderId: user.userId, recipientId: partner } })} />
  </section>;
}
