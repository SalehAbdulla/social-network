'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { type ChatUser, type ChatMessage, type Group, displayName, errorMessage, request, upload } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { useDialogFocus } from '../lib/useDialogFocus';
import Avatar from '../components/Avatar';
import ConversationList, { type ConversationItem } from '../components/messages/ConversationList';
import EmptyChat from '../components/messages/EmptyChat';
import NewMessageModal from '../components/messages/NewMessageModal';
import { previewTime } from '../components/messages/time';
import { memberCount } from '../components/messages/group/groupContent';
import DirectConversation from '../components/DirectConversation';
import GroupConversation from '../components/GroupConversation';
import GroupInvitations from '../components/GroupInvitations';
import ImagePicker from '../components/ImagePicker';
import { useBackend } from '../components/BackendProvider';
import { DM_AVATAR_SIZE } from '../lib/sizing';

const GROUPS_PER_PAGE = 30;
const PREVIEW_LIMIT = 25;

interface Preview { text: string; mine: boolean; media: boolean; unread: boolean }

export default function MessagesInboxPage() {
  const params = useParams<{ userId?: string; groupId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useBackend();
  const meId = user.userId;
  const groupTab = pathname.startsWith('/messages/groups');
  const partner = params.userId;
  const groupId = params.groupId;
  const active = !!(partner || groupId);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [browsingGroups, setBrowsingGroups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const createDialog = useDialogFocus<HTMLFormElement>(() => { if (!busy) setCreating(false); }, { enabled: creating });
  const users = useResource<ChatUser[]>('/messages/users');
  const groups = usePagedList<Group, Group[]>({
    key: `/groups?scope=${browsingGroups ? 'all' : 'joined'}&q=${encodeURIComponent(query)}`,
    pageQuery: page => `&offset=${(page - 1) * GROUPS_PER_PAGE}`,
    pageSize: GROUPS_PER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: group => group.groupId,
    enabled: groupTab,
  });
  useLiveRefresh(users.reload);
  useLiveRefresh(groups.refresh);
  const updateGroups = groups.update;
  const reloadGroups = groups.refresh;
  useEffect(() => {
    const requested = (event: Event) => {
      const { groupId: requestedId } = (event as CustomEvent<{ groupId: number }>).detail;
      updateGroups(items => items.map(group => group.groupId === requestedId ? { ...group, joinRequested: true } : group));
      reloadGroups();
    };
    window.addEventListener('social:group-requested', requested);
    return () => window.removeEventListener('social:group-requested', requested);
  }, [updateGroups, reloadGroups]);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (active) document.body.dataset.dmChat = 'open';
    else delete document.body.dataset.dmChat;
    return () => { delete document.body.dataset.dmChat; };
  }, [active]);

  useEffect(() => {
    const people = users.data?.slice(0, PREVIEW_LIMIT);
    if (!people?.length) return;
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
            mine: newest.senderId === meId,
            media: !!newest.mediaUrl,
            unread: newest.recipientId === meId && !newest.isRead,
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
  }, [users.data, meId]);

  function previewOf(personId: string): string {
    const preview = previews[personId];
    if (!preview) return '';
    const body = preview.media ? 'Sent an attachment.' : preview.text;
    if (!body) return '';
    return preview.mine ? `You: ${body}` : body;
  }

  const peopleItems = useMemo<ConversationItem[]>(() => (users.data ?? [])
    .filter(person => `${displayName(person)} ${person.nickname}`.toLowerCase().includes(search.toLowerCase()))
    .map(person => ({
      key: person.userId,
      href: `/messages/${person.userId}`,
      name: displayName(person),
      avatar: <Avatar name={displayName(person)} avatarUrl={person.avatar} size={DM_AVATAR_SIZE} />,
      online: !!person.isOnline,
      preview: previewOf(person.userId),
      stamp: person.lastMessageTime ? previewTime(person.lastMessageTime) : '',
      unread: !!previews[person.userId]?.unread,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    })), [users.data, search, previews]);

  const groupItems = useMemo<ConversationItem[]>(() => groups.items.map(group => ({
    key: String(group.groupId),
    href: `/messages/groups/${group.groupId}`,
    name: group.title,
    avatar: <Avatar name={group.title} avatarUrl={group.imageUrl} size={DM_AVATAR_SIZE} />,
    preview: group.isMember ? memberCount(group.memberCount) : group.joinRequested ? 'Request pending' : 'Discover · Request to join',
    stamp: '',
    unread: false,
  })), [groups.items]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const imageUrl = files.length ? (await upload(files[0])).url : '';
      const group = await request<Group>('/groups', 'POST', { title: data.get('title'), description: data.get('description'), imageUrl });
      setCreating(false); setFiles([]); setSearch(''); setQuery(''); setBrowsingGroups(false);
      groups.reload(); router.push(`/messages/groups/${group.groupId}`); toast.success('Group created');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  const selected = users.data?.find(person => person.userId === partner);

  return <>
    <div className="dm-shell" data-active={active ? 'true' : 'false'}>
      <ConversationList
        tab={groupTab ? 'groups' : 'primary'}
        currentUserName={displayName(user) || user.nickname}
        search={search}
        onSearch={setSearch}
        onCompose={() => (groupTab ? setCreating(true) : setComposing(true))}
        composeLabel={groupTab ? 'Create group' : 'New message'}
        items={groupTab ? groupItems : peopleItems}
        loading={groupTab ? groups.loading : users.loading}
        error={groupTab ? groups.error : users.error}
        onRetry={groupTab ? groups.reload : users.reload}
        empty={groupTab
          ? (search ? 'No groups found.' : 'Your joined groups will appear here. Find a group to join or create your own.')
          : (search ? 'No messages found' : 'Your conversations will appear here after your first message.')}
        activeKey={groupTab ? groupId : partner}
        extra={groupTab ? <div className="space-y-3 pb-1">
          <div className="dm-list-block"><GroupInvitations changed={groups.reload} /></div>
          <div className="dm-list-block"><button type="button" className="dm-secondary dm-list-action" onClick={() => { setBrowsingGroups(!browsingGroups); setSearch(''); setQuery(''); }}>{browsingGroups ? 'Back to your groups' : 'Find groups to join'}</button></div>
        </div> : undefined}
      />
      <div className="dm-chat">
        {groupId ? <GroupConversation key={groupId} groupId={groupId} />
          : partner ? <DirectConversation key={partner} partner={partner} person={selected} />
          : <EmptyChat onNew={() => setComposing(true)} />}
      </div>
    </div>
    {composing && <NewMessageModal meId={meId} onClose={() => setComposing(false)} />}
    {creating && <div className="dm-modal" onClick={() => { if (!busy) setCreating(false); }}>
      <form ref={createDialog} onSubmit={create} role="dialog" aria-modal="true" aria-labelledby="create-group-title" tabIndex={-1} className="dm-modal-card" onClick={event => event.stopPropagation()}>
        <div className="dm-modal-head">
          <h2 id="create-group-title">Create a group</h2>
          <button type="button" aria-label="Close create group" className="dm-icon" onClick={() => setCreating(false)}><X aria-hidden="true" /></button>
        </div>
        <fieldset disabled={busy} className="grp-sheet-body">
          <label className="grp-field">Group name<input autoFocus name="title" required minLength={3} maxLength={100} placeholder="Give your group a name" /></label>
          <label className="grp-field">Description<textarea name="description" maxLength={1000} rows={3} placeholder="What brings your group together?" /></label>
          <ImagePicker files={files} onChange={setFiles} max={1} disabled={busy} />
        </fieldset>
        <div className="dm-modal-foot">
          <button className="dm-primary" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
        </div>
      </form>
    </div>}
  </>;
}
