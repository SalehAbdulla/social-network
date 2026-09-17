'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { type ChatUser, type ChatMessage, type SocketEvent, dateLabel, errorMessage, request, upload } from '../api/social';
import { useBackend } from '../components/BackendProvider';
import { useResource } from '../lib/useResource';
import Avatar from '../components/Avatar';
import RequestState from '../components/RequestState';
import Loading from '../components/Loading';

function Thread({ partner, nickname }: { partner: string; nickname: string }) {
  const { user, connected, sendEvent } = useBackend();
  const [offset, setOffset] = useState(0);
  const thread = useResource<{ messages: ChatMessage[]; totalElements: number }>(`/messages?partnerId=${partner}&offset=${offset}`);
  const reload = thread.reload;
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const listener = (event: Event) => {
      const message = (event as CustomEvent<SocketEvent>).detail;
      if (['message_changed', 'incoming_msg', 'connected', 'read_receipt'].includes(message.type)) reload();
      if (message.payload?.senderId === partner) {
        if (message.type === 'typing') { setTyping(true); clearTimeout(timer); timer = setTimeout(() => setTyping(false), 3000); }
        if (message.type === 'typing_stopped') { setTyping(false); clearTimeout(timer); }
      }
    };
    window.addEventListener('social:socket', listener);
    const poll = setInterval(reload, 15000);
    return () => { clearTimeout(timer); clearInterval(poll); window.removeEventListener('social:socket', listener); };
  }, [partner, reload]);
  useEffect(() => {
    if (!connected) return;
    sendEvent({ type: 'open_chat', payload: { partnerId: partner } });
    return () => { sendEvent({ type: 'close_chat', payload: {} }); };
  }, [connected, partner, sendEvent]);
  useEffect(() => {
    if (offset === 0) bottom.current?.scrollIntoView({ block: 'nearest' });
    if (thread.data?.messages.some(message => message.recipientId === user.userId && !message.isRead)) {
      void request('/messages/read', 'POST', { partnerId: partner }).then(() => window.dispatchEvent(new Event('social:notifications'))).catch(error => toast.error(errorMessage(error)));
    }
  }, [thread.data, offset, partner, user.userId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || (!text.trim() && !attachment)) return;
    setBusy(true);
    try {
      if (editing) await request(`/messages/${editing}`, 'PUT', { text });
      else {
        const media = attachment ? await upload(attachment) : null;
        await request('/messages', 'POST', { recipientId: partner, text, mediaUrl: media?.url || '', mediaType: media?.mediaType || '' });
      }
      setText(''); setAttachment(null); setEditing(null); setOffset(0); reload();
      if (fileInput.current) fileInput.current.value = '';
      sendEvent({ type: 'typing_stopped', payload: { senderId: user.userId, recipientId: partner } });
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  async function remove(id: number, scope: string) {
    setBusy(true); try { await request(`/messages/${id}?scope=${scope}`, 'DELETE'); reload(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="flex h-full min-h-0 flex-1 flex-col"><header className="flex items-center justify-between border-b border-slate-100 bg-white p-4"><Link href={`/profile/${partner}`} className="flex items-center gap-2"><Avatar name={nickname} /><span className="font-semibold">@{nickname}</span></Link><span className="text-xs text-slate-400">{connected ? 'Live updates connected' : 'Reconnecting?'}</span></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4"><div className="flex justify-between text-xs"><button disabled={!thread.data || offset + 10 >= thread.data.totalElements} className="disabled:opacity-40" onClick={() => setOffset(offset + 10)}>Older messages</button><button disabled={offset === 0} className="disabled:opacity-40" onClick={() => setOffset(Math.max(0, offset - 10))}>Newer messages</button></div>
      {thread.loading && <Loading />}{thread.error && <RequestState error={thread.error} retry={reload} />}{thread.data?.messages.length === 0 && <RequestState empty="Start the conversation. Your messages will appear here." />}
      {[...(thread.data?.messages || [])].reverse().map(message => { const mine = message.senderId === user.userId; return <div key={message.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-xl p-3 space-y-2 ${mine ? 'bg-blue-600 text-white' : 'border border-slate-100 bg-white text-slate-800'}`}>
        {message.mediaUrl && (message.mediaType === 'video' ? <video src={message.mediaUrl} controls className="max-h-64 rounded-lg" /> : <img src={message.mediaUrl} alt="Message attachment" className="max-h-64 rounded-lg" />)}<p className="whitespace-pre-wrap break-words">{message.textMessage}</p><p className={`text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{dateLabel(message.timeStamp)}{message.editedAt && ' ? edited'}{mine && (message.isRead ? ' ? read' : ' ? sent')}</p>
        <div className="flex flex-wrap gap-3 text-[11px] opacity-75">{mine && <><button disabled={busy} onClick={() => { setEditing(message.messageId); setText(message.textMessage); }}>Edit</button><button disabled={busy} onClick={() => void remove(message.messageId, 'everyone')}>Delete for everyone</button></>}<button disabled={busy} onClick={() => void remove(message.messageId, 'me')}>Delete for me</button></div>
      </div></div>; })}<div ref={bottom} />
    </div>
    <div className="min-h-6 px-4 text-xs text-slate-500">{typing && `${nickname} is typing?`}</div>
    <form onSubmit={send} className="border-t border-slate-100 bg-white p-4 space-y-2">{editing && <div className="flex justify-between text-sm text-blue-600">Editing message<button type="button" onClick={() => { setEditing(null); setText(''); }}>Cancel</button></div>}{attachment && <div className="flex justify-between text-sm"><span>{attachment.name}</span><button type="button" onClick={() => { setAttachment(null); if (fileInput.current) fileInput.current.value = ''; }}>Remove</button></div>}
      <div className="flex items-end gap-2"><textarea aria-label="Message" aria-describedby="message-keyboard-hint" value={text} rows={2} maxLength={2000} onChange={event => { setText(event.target.value); sendEvent({ type: event.target.value ? 'typing' : 'typing_stopped', payload: { senderId: user.userId, recipientId: partner } }); }} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          if (!event.repeat && !busy) event.currentTarget.form?.requestSubmit();
        }
      }} onBlur={() => sendEvent({ type: 'typing_stopped', payload: { senderId: user.userId, recipientId: partner } })} placeholder="Write a message..." className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 p-3 text-sm" /><button disabled={busy || (!text.trim() && !attachment)} className="rounded-lg bg-blue-600 px-4 py-3 text-sm text-white disabled:opacity-50">{busy ? 'Sending...' : editing ? 'Save' : 'Send'}</button></div>
      <p id="message-keyboard-hint" className="text-xs text-slate-500">Enter to send, Shift + Enter for a new line.</p>
      {!editing && <input ref={fileInput} aria-label="Attach photo or video" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" onChange={event => setAttachment(event.target.files?.[0] || null)} className="max-w-full text-xs text-slate-500" />}
    </form>
  </div>;
}
export default function MessagesInboxPage() {
  const { user } = useBackend();
  const params = useParams<{ userId?: string }>();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const users = useResource<ChatUser[]>('/messages/users');
  const reload = users.reload;
  useEffect(() => { window.addEventListener('social:socket', reload); const timer = setInterval(reload, 30000); return () => { window.removeEventListener('social:socket', reload); clearInterval(timer); }; }, [reload]);
  const partner = params.userId;
  const selected = users.data?.find(person => person.userId === partner);
  return <div className="flex h-screen min-h-0 flex-col p-4 sm:p-6 gap-4"><h1 className="text-2xl font-bold">Messages</h1><div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
    <aside className={`w-full shrink-0 overflow-y-auto border-r border-slate-100 sm:w-56 lg:w-64 ${partner ? 'max-sm:hidden' : ''}`}><div className="p-3"><input aria-label="Search conversations" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search people" className="w-full rounded-lg bg-slate-50 p-2 text-sm" /></div>{users.error && <RequestState error={users.error} retry={reload} />}{users.loading && <Loading />}{users.data?.filter(person => person.nickname.toLowerCase().includes(search.toLowerCase())).map(person => <Link key={person.userId} href={`/messages/${person.userId}`} className={`flex items-center gap-3 p-4 ${partner === person.userId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><Avatar name={person.nickname} /><div className="min-w-0"><p className="truncate text-sm font-medium">@{person.nickname}</p><p className="text-xs text-slate-400">{person.isOnline ? 'Online' : 'Offline'}</p></div></Link>)}{users.data?.length === 0 && <p className="p-4 text-sm text-slate-500">No other users yet.</p>}</aside>
    <div className={`flex min-w-0 flex-1 flex-col ${!partner ? 'max-sm:hidden' : ''}`}>{partner && <button onClick={() => router.push('/messages')} className="p-2 text-left text-sm text-blue-600 sm:hidden">Back to people</button>}{partner && partner !== user.userId ? <Thread key={partner} partner={partner} nickname={selected?.nickname || 'user'} /> : <div className="m-auto p-8 text-center text-slate-400">Choose a person to start chatting.</div>}</div>
  </div></div>;
}
