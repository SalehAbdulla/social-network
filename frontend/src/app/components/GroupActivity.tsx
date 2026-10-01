'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { dateLabel, displayName, errorMessage, request, upload } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { linkify } from '../lib/linkify';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useBackend } from './BackendProvider';
import ChatComposer from './ChatComposer';
import MessageActions from './MessageActions';
import ImagePicker from './ImagePicker';
import Loading from './Loading';
import LoadMore from './LoadMore';
import { mediaImageProps } from '../lib/mediaVariants';

const GROUP_PAGE_SIZE = 30;

interface Content {
  id: number; userId: string; firstName: string; lastName: string; nickname: string; kind: string;
  parentId: number; title: string; content: string; mediaUrl: string; startsAt: string; createdAt: string;
  rsvp: string; going: number; notGoing: number;
  /** Decided by the server from the same SQL that orders the events tab. */
  upcoming: boolean;
}

function ContentForm({ groupId, kind, item, parentId = 0, saved, cancel }: {
  groupId: string; kind: string; item?: Content; parentId?: number; saved: () => void; cancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState(item?.mediaUrl || '');
  const localStart = item?.startsAt ? (() => { const date = new Date(item.startsAt); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); })() : '';
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget); setBusy(true);
    try {
      const mediaUrl = files.length ? (await upload(files[0])).url : existing;
      await request(`/groups/${groupId}/content/${kind}${item ? `/${item.id}` : ''}?parentId=${parentId}`, item ? 'PUT' : 'POST', {
        title: String(data.get('title') || ''), content: String(data.get('content') || ''), mediaUrl,
        startsAt: data.get('startsAt') ? new Date(String(data.get('startsAt'))).toISOString() : '',
      });
      saved();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <fieldset disabled={busy} className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{item ? 'Edit' : 'Create'} {kind === 'events' ? 'event' : kind === 'comments' ? 'comment' : kind === 'messages' ? 'message' : 'post'}</h3><button aria-label="Close composer" type="button" onClick={cancel}><X size={18} /></button></div>
      {kind === 'events' && <><label className="chat-label">Event name<input name="title" defaultValue={item?.title} required minLength={3} maxLength={100} className="chat-field" placeholder="What's the occasion?" /></label><label className="chat-label">Date and time<input name="startsAt" type="datetime-local" defaultValue={localStart} required className="chat-field" /></label></>}
      <label className="chat-label">{kind === 'events' ? 'Description' : 'Your message'}<textarea name="content" defaultValue={item?.content} required={kind === 'events' || (!files.length && !existing)} maxLength={5000} rows={3} className="chat-field" placeholder={kind === 'events' ? 'Add the place and details for your group.' : 'Share something with the group…'} /></label>
      {kind !== 'events' && <ImagePicker max={1} files={files} onChange={setFiles} existing={existing ? [existing] : []} onRemoveExisting={() => setExisting('')} disabled={busy} />}
      <div className="flex gap-2"><button className="chat-primary">{busy ? 'Saving…' : item ? 'Save changes' : kind === 'events' ? 'Create event' : 'Publish'}</button><button type="button" className="chat-secondary" onClick={cancel}>Cancel</button></div>
    </fieldset>
  </form>;
}

function PostComments({ groupId, parentId, isOwner }: { groupId: string; parentId: number; isOwner: boolean }) {
  const [open, setOpen] = useState(true);
  return <div className="border-t border-slate-100 pt-2"><button className="text-xs font-medium text-teal-700" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide comments' : 'Comments'}</button>{open && <div className="mt-3"><GroupActivity groupId={groupId} kind="comments" parentId={parentId} isOwner={isOwner} /></div>}</div>;
}

export default function GroupActivity({ groupId, kind = 'timeline', parentId = 0, isOwner = false }: { groupId: string; kind?: string; parentId?: number; isOwner?: boolean }) {
  const { user } = useBackend();
  const [composer, setComposer] = useState<string | null>(null);
  const [editing, setEditing] = useState<Content | null>(null);
  const [busy, setBusy] = useState(false);
  const path = `/groups/${groupId}/content/${kind}?parentId=${parentId}`;
  const resource = usePagedList<Content, Content[]>({
    key: path,
    pageQuery: page => `&offset=${(page - 1) * GROUP_PAGE_SIZE}`,
    pageSize: GROUP_PAGE_SIZE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.id,
  });
  // A background refresh folds the newest page in, so a scrolled-up reader keeps
  // the history they already opened.
  useLiveRefresh(resource.refresh, groupId);
  const bottom = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const items = resource.items;
  const isChat = kind === 'timeline';
  // The events tab is split into what is still to come and what has been. The
  // server says which is which: `upcoming` comes from the same SQL that orders the
  // tab, so the sections and the order cannot disagree, and nothing here depends
  // on when the render happened to run.
  const rows = isChat ? [...items].reverse() : items;
  const sections = kind === 'events'
    ? [
        { heading: 'Upcoming', rows: rows.filter(item => item.upcoming) },
        { heading: 'Past', rows: rows.filter(item => !item.upcoming) },
      ]
    : [{ heading: '', rows }];
  useEffect(() => {
    if (isChat && nearBottom.current) bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [resource.items, isChat]);
  function saved() { setComposer(null); setEditing(null); nearBottom.current = true; resource.reload(); }
  async function mutate(action: () => Promise<unknown>) {
    if (busy) return; setBusy(true);
    try { await action(); resource.reload(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className={kind === 'comments' ? 'space-y-3' : 'flex min-h-0 flex-1 flex-col'}>
    <div className={`${kind === 'comments' ? '' : 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6'} ${isChat ? 'chat-background' : 'bg-slate-50'}`} onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{isChat ? 'A place for your group to stay connected' : kind === 'media' ? 'Photos shared in this group' : kind === 'events' ? 'Make plans together' : kind === 'comments' ? 'Keep the conversation going' : 'Updates from your group'}</p>
        <button className="chat-secondary flex shrink-0 items-center gap-1 text-xs" onClick={() => { setEditing(null); setComposer(isChat ? 'events' : kind === 'media' ? 'posts' : kind); }}><Plus size={15} />{isChat || kind === 'events' ? 'Event' : kind === 'media' ? 'Photo' : kind === 'comments' ? 'Comment' : 'Post'}</button>
      </div>
      {(composer || editing) && <div className="mb-5"><ContentForm key={editing?.id || composer} groupId={groupId} kind={editing?.kind || composer || 'posts'} item={editing || undefined} parentId={editing?.parentId || parentId} saved={saved} cancel={() => { setComposer(null); setEditing(null); }} /></div>}
      {resource.loading && <Loading height={80} />}
      {resource.error && <button className="chat-secondary" onClick={resource.reload}>Retry loading</button>}
      {resource.settled && resource.items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{isChat ? 'Say hello, share a photo, or plan your first event.' : `No ${kind} yet.`}</p>}
      {/* The chat shows the newest item last, so older pages load at the top. */}
      {isChat && <LoadMore loading={resource.loadingMore} hasMore={resource.hasMore} onLoadMore={resource.loadMore} label="Load earlier messages" endLabel={null} className="py-2" />}
      <div className={kind === 'media' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>{sections.map(section => <Fragment key={section.heading}>
        {section.heading && section.rows.length > 0 && <h4 className="pt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{section.heading}</h4>}
        {section.rows.map(item => {
        const mine = item.userId === user.userId;
        const ownMessage = isChat && mine && item.kind === 'messages';
        return <div key={item.id} className={isChat ? `flex ${mine ? 'justify-end' : 'justify-start'}` : ''}>
          <article className={`min-w-0 space-y-3 rounded-2xl border p-4 shadow-sm ${ownMessage ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-800'} ${isChat ? `w-fit max-w-[92%] sm:max-w-[80%] ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'}` : ''}`}>
            <div className="flex items-center justify-between gap-3"><span className={`text-xs font-semibold ${ownMessage ? 'text-teal-100' : 'text-teal-800'}`}>{mine ? 'You' : displayName(item)}</span>{(mine || isOwner) && <MessageActions label="Group item actions">{mine && <button className="chat-menu" onClick={() => { setEditing(item); setComposer(null); }}>Edit</button>}<button disabled={busy} className="chat-menu text-red-600" onClick={() => void mutate(() => request(`/groups/${groupId}/content/${item.kind}/${item.id}?parentId=${item.parentId}`, 'DELETE'))}>Delete</button></MessageActions>}</div>
            {item.kind === 'events' && <div className="flex items-start gap-3"><div className="rounded-xl bg-teal-100 p-3 text-teal-700"><CalendarDays size={24} /></div><div><span className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Group event</span><h3 className="font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{dateLabel(item.startsAt)}</p></div></div>}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{linkify(item.content)}</p>
            {item.mediaUrl && <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="block"><img {...mediaImageProps(item.mediaUrl, '(max-width: 768px) 100vw, 480px')} alt="Group photo" className="aspect-square max-h-96 w-full rounded-xl bg-slate-100 object-contain" /></a>}
            {item.kind === 'events' && <div className="space-y-3 border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">{item.going} going · {item.notGoing} not going</p><div className="flex flex-wrap gap-2">{['going', 'not_going'].map(status => <button key={status} disabled={busy} aria-pressed={item.rsvp === status} className={`flex items-center gap-1 ${item.rsvp === status ? 'chat-primary' : 'chat-secondary'}`} onClick={() => void mutate(() => request(`/groups/${groupId}/events/${item.id}/rsvp`, 'PUT', { status }))}>{item.rsvp === status && <Check size={14} />}{status === 'going' ? 'Going' : 'Not going'}</button>)}</div></div>}
            <time className={`block text-right text-[10px] ${ownMessage ? 'text-teal-100' : 'text-slate-400'}`}>{dateLabel(item.createdAt)}</time>
            {item.kind === 'posts' && kind !== 'media' && <PostComments groupId={groupId} parentId={item.id} isOwner={isOwner} />}
          </article>
        </div>;
        })}
      </Fragment>)}</div>{!isChat && <LoadMore loading={resource.loadingMore} hasMore={resource.hasMore} onLoadMore={resource.loadMore} label={kind === 'comments' ? 'Load more comments' : 'Load more'} endLabel={null} />}<div ref={bottom} />
    </div>
    {isChat && <ChatComposer onSend={async (text, file) => {
      const media = file ? await upload(file) : null;
      await request(`/groups/${groupId}/content/messages`, 'POST', { content: text, mediaUrl: media?.url || '' }); saved();
    }} />}
  </div>;
}
