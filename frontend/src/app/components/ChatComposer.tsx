'use client';
import { useRef, useState } from 'react';
import { Paperclip, Send, Smile, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '../api/social';
import ImagePicker from './ImagePicker';

export default function ChatComposer({ onSend, onTyping, initialText = '', editing = false, onCancel, allowVideo = false }: {
  onSend: (text: string, file: File | null) => Promise<void>; onTyping?: (typing: boolean) => void;
  initialText?: string; editing?: boolean; onCancel?: () => void; allowVideo?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const typingAt = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || (!text.trim() && !files.length)) return;
    pending.current = true; setBusy(true);
    try { await onSend(text.trim(), files[0] || null); setText(''); setFiles([]); setAttachments(false); setEmojis(false); onTyping?.(false); }
    catch (error) { toast.error(errorMessage(error)); }
    finally { pending.current = false; setBusy(false); textarea.current?.focus(); }
  }
  return <form onSubmit={submit} className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
    {editing && <div className="mb-3 flex items-center justify-between rounded-lg bg-teal-50 p-2 text-sm text-teal-800">Editing message<button type="button" aria-label="Cancel edit" onClick={onCancel}><X size={17} /></button></div>}
    {attachments && <div className="mb-3"><ImagePicker files={files} onChange={setFiles} max={1} disabled={busy} allowVideo={allowVideo} /></div>}
    {emojis && <div className="mb-2 flex flex-wrap gap-1" aria-label="Emoji picker">{['😀', '❤️', '👍', '🎉', '😂', '🙏', '👋', '🔥'].map(emoji => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} className="rounded-lg p-2 text-xl hover:bg-slate-100" onClick={() => { setText(value => value + emoji); textarea.current?.focus(); }}>{emoji}</button>)}</div>}
    <div className="flex items-end gap-2">
      {!editing && <button type="button" aria-label="Attach photo" aria-expanded={attachments} onClick={() => setAttachments(!attachments)} className="chat-icon"><Paperclip size={20} /></button>}
      <button type="button" aria-label="Choose emoji" aria-expanded={emojis} onClick={() => setEmojis(!emojis)} className="chat-icon"><Smile size={20} /></button>
      <textarea ref={textarea} aria-label="Message" rows={1} maxLength={2000} value={text} disabled={busy} placeholder="Write a message…" className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-teal-500" onChange={event => {
        setText(event.target.value);
        if (!event.target.value || Date.now() - typingAt.current > 1500) { onTyping?.(!!event.target.value); typingAt.current = Date.now(); }
      }} onBlur={() => onTyping?.(false)} onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!event.repeat) event.currentTarget.form?.requestSubmit(); }
      }} />
      <button aria-label={editing ? 'Save message' : 'Send message'} disabled={busy || (!text.trim() && !files.length)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40"><Send size={19} /></button>
    </div>
    <p className="mt-2 text-right text-[10px] text-slate-400">{busy ? 'Sending…' : 'Enter to send · Shift + Enter for a new line'}</p>
  </form>;
}
