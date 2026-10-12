'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ImagePlus, Smile, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage } from '../../api/social';
import { isImageType, isVideoType } from '../../lib/mediaLimits';

export interface ComposerHandle {
  attach: (files: File[]) => void;
}

const MAX_MEDIA = 10;
const UNSUPPORTED_IMAGE = 'Choose a JPEG, PNG, GIF or WebP image.';
const UNSUPPORTED_MEDIA = 'Choose a JPEG, PNG, GIF, WebP, MP4 or WebM file.';

export default function Composer({ onSend, onTyping, onDraft, initialText = '', editing = false, onCancel, allowVideo = false, placeholder = 'Message...', replyTo, onCancelReply, dropping = false, ref }: {
  onSend: (text: string, file: File | null) => Promise<void>;
  onTyping?: (typing: boolean) => void;
  onDraft?: (text: string) => void;
  initialText?: string;
  editing?: boolean;
  onCancel?: () => void;
  allowVideo?: boolean;
  placeholder?: string;
  replyTo?: { name: string; snippet: string } | null;
  onCancelReply?: () => void;
  // A file is being dragged over the conversation this composer sits in. The zone itself belongs to
  // the panel (see `useMediaDrop`), which hands the files over through the handle below: a drop on
  // the thread and a drop on the pill have to end up as the same set of attachments.
  dropping?: boolean;
  ref?: Ref<ComposerHandle>;
}) {
  const [text, setText] = useState(initialText);
  const [media, setMedia] = useState<{ file: File; url: string }[]>([]);
  const [attachments, setAttachments] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const typingAt = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const liveUrls = useRef<string[]>([]);
  useEffect(() => { liveUrls.current = media.map(item => item.url); }, [media]);
  useEffect(() => () => { liveUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 124)}px`;
    element.style.overflowY = element.scrollHeight > 124 ? 'auto' : 'hidden';
  }, [text]);

  // One way in for media: the picker and a drop hand over the same files, so the accepted types,
  // the cap and the previews are decided here rather than once per entrance.
  const addFiles = useCallback((files: File[]) => {
    const accepted = files.filter(file => isImageType(file.type) || (allowVideo && isVideoType(file.type)));
    if (!accepted.length) { toast.error(allowVideo ? UNSUPPORTED_MEDIA : UNSUPPORTED_IMAGE); return; }
    if (accepted.length > MAX_MEDIA - media.length) toast.error(`You can add up to ${MAX_MEDIA} attachments.`);
    setAttachments(true);
    setMedia(current => [...current, ...accepted.slice(0, Math.max(0, MAX_MEDIA - current.length)).map(file => ({ file, url: URL.createObjectURL(file) }))]);
  }, [allowVideo, media.length]);

  const attach = useCallback((files: File[]) => {
    // An edit only rewrites the text of a message, and a send is already on its way: in both the
    // previews would be thrown away again, so the drop is ignored rather than half taken.
    if (editing || busy || !files.length) return;
    addFiles(files);
    textarea.current?.focus();
  }, [editing, busy, addFiles]);
  useImperativeHandle(ref, () => ({ attach }), [attach]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || (!text.trim() && !media.length)) return;
    pending.current = true;
    setBusy(true);
    const outgoing = media.map(item => item.file);
    try {
      await onSend(text.trim(), outgoing[0] || null);
      for (const file of outgoing.slice(1)) await onSend('', file);
      media.forEach(item => URL.revokeObjectURL(item.url));
      setText('');
      setMedia([]);
      setAttachments(false);
      setEmojis(false);
      onDraft?.('');
      onCancelReply?.();
      onTyping?.(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
      textarea.current?.focus();
    }
  }

  const canSend = !!text.trim() || media.length > 0;
  const dropActive = !editing && dropping;

  return <form onSubmit={submit} className="dm-composer" data-drop={dropActive}>
    {editing && <div className="dm-reply">
      <span className="dm-reply-text">Editing message</span>
      <button type="button" aria-label="Cancel edit" onClick={onCancel}><X aria-hidden="true" /></button>
    </div>}
    {replyTo && <div className="dm-reply">
      <span className="dm-reply-text">Replying to {replyTo.name}: {replyTo.snippet}</span>
      <button type="button" aria-label="Cancel reply" onClick={onCancelReply}><X aria-hidden="true" /></button>
    </div>}
    {dropActive && <p className="dm-drop-hint">
      <ImagePlus aria-hidden="true" />{allowVideo ? 'Drop photos or videos to attach' : 'Drop photos to attach'}
    </p>}
    {media.length > 0 && <div className="dm-attach">
      {media.map((item, index) => <span key={item.url} className="dm-attach-item">
        <img src={item.url} alt={`Attachment ${index + 1}`} />
        <button type="button" aria-label={`Remove attachment ${index + 1}`} className="dm-attach-remove" onClick={() => { URL.revokeObjectURL(item.url); setMedia(current => current.filter((_, position) => position !== index)); }}>
          <X aria-hidden="true" />
        </button>
      </span>)}
    </div>}
    {emojis && <div className="dm-composer-emoji" aria-label="Emoji picker">
      {['😀', '❤️', '👍', '🎉', '😂', '🙏', '👋', '🔥'].map(emoji => <button key={emoji} type="button" aria-label={`Insert ${emoji}`} onClick={() => { setText(value => value + emoji); textarea.current?.focus(); }}>{emoji}</button>)}
    </div>}
    <div className="dm-composer-field">
      <button type="button" aria-label="Choose emoji" aria-expanded={emojis} className="dm-composer-btn" onClick={() => setEmojis(value => !value)}>
        <Smile aria-hidden="true" />
      </button>
      <textarea
        ref={textarea}
        rows={1}
        aria-label="Message"
        maxLength={2000}
        value={text}
        readOnly={busy}
        aria-busy={busy}
        placeholder={placeholder}
        onChange={event => {
          setText(event.target.value);
          onDraft?.(event.target.value);
          if (!event.target.value || Date.now() - typingAt.current > 1500) {
            onTyping?.(!!event.target.value);
            typingAt.current = Date.now();
          }
        }}
        onBlur={() => onTyping?.(false)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!event.repeat) event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {canSend
        ? <button type="submit" aria-label={editing ? 'Save message' : 'Send message'} disabled={busy} className="dm-composer-send">{editing ? 'Save' : 'Send'}</button>
        : <>
          {!editing && <button type="button" aria-label="Attach photo" aria-expanded={attachments} className="dm-composer-btn" onClick={() => { setAttachments(true); picker.current?.click(); }}>
            <ImagePlus aria-hidden="true" />
          </button>}
          <input
            ref={picker}
            type="file"
            className="sr-only"
            aria-label="Add photo or video"
            accept={allowVideo ? 'image/*,video/*' : 'image/*'}
            multiple
            onChange={event => {
              const selected = Array.from(event.target.files || []);
              event.target.value = '';
              if (selected.length) addFiles(selected);
            }}
          />
        </>}
    </div>
  </form>;
}
