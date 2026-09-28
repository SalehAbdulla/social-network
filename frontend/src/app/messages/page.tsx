'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { MessageCircle, Plus, Search, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { type ChatUser, type Group, displayName, errorMessage, request, upload } from '../api/social';
import { usePagedList } from '../lib/usePagedList';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import Avatar from '../components/Avatar';
import DirectConversation from '../components/DirectConversation';
import GroupConversation from '../components/GroupConversation';
import GroupInvitations from '../components/GroupInvitations';
import ImagePicker from '../components/ImagePicker';
import Loading from '../components/Loading';
import LoadMore from '../components/LoadMore';

const GROUPS_PER_PAGE = 30;

export default function MessagesInboxPage() {
  const params = useParams<{ userId?: string; groupId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const groupTab = pathname.startsWith('/messages/groups');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [browsingGroups, setBrowsingGroups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const users = useResource<ChatUser[]>('/messages/users');
  const groups = usePagedList<Group, Group[]>({
    // Scope and query are the identity, so a new search starts at offset 0.
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
      const { groupId } = (event as CustomEvent<{ groupId: number }>).detail;
      updateGroups(items => items.map(group => group.groupId === groupId ? { ...group, joinRequested: true } : group));
      reloadGroups();
    };
    window.addEventListener('social:group-requested', requested);
    return () => window.removeEventListener('social:group-requested', requested);
  }, [updateGroups, reloadGroups]);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const partner = params.userId;
  const groupId = params.groupId;
  const selected = users.data?.find(person => person.userId === partner);
  const active = !!(partner || groupId);
  const people = users.data?.filter(person => `${displayName(person)} ${person.nickname}`.toLowerCase().includes(search.toLowerCase()));
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const imageUrl = files.length ? (await upload(files[0])).url : '';
      const group = await request<Group>('/groups', 'POST', { title: data.get('title'), description: data.get('description'), imageUrl });
      setCreating(false); setFiles([]); setSearch(''); setQuery(''); setBrowsingGroups(false); groups.reload(); router.push(`/messages/groups/${group.groupId}`); toast.success('Group created');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="flex h-dvh min-h-0 flex-col bg-slate-100 p-2 pt-16 sm:p-4 lg:p-6">
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside aria-label="Conversations" className={`flex w-full shrink-0 flex-col border-r border-slate-200 md:w-72 xl:w-80 ${active ? 'max-md:hidden' : ''}`}>
        <div className="shrink-0 space-y-4 p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-600">Stay connected</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Messages</h1></div>{groupTab ? <button aria-label="Create group" className="chat-icon bg-teal-50 text-teal-700" onClick={() => setCreating(true)}><Plus size={20} /></button> : <Link href="/discover" aria-label="New message" title="New message" className="chat-icon bg-teal-50 text-teal-700"><Plus size={20} /></Link>}</div>
          <nav aria-label="Conversation types" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">{[['/messages', 'People', MessageCircle], ['/messages/groups', 'Groups', Users]].map(([href, label, Icon]) => { const TabIcon = Icon as typeof Users; const selectedTab = label === 'Groups' ? groupTab : !groupTab; return <Link key={String(href)} href={String(href)} aria-current={selectedTab ? 'page' : undefined} onClick={() => { setSearch(''); setQuery(''); setBrowsingGroups(false); }} className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm ${selectedTab ? 'bg-white font-semibold text-teal-800 shadow-sm' : 'text-slate-500'}`}><TabIcon size={16} />{String(label)}</Link>; })}</nav>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search size={16} className="shrink-0 text-slate-400" /><input aria-label="Search conversations" value={search} onChange={event => setSearch(event.target.value)} placeholder={groupTab ? browsingGroups ? 'Find a group' : 'Search your groups' : 'Search conversations'} className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none" /></label>
          {groupTab && <button className="chat-secondary w-full text-sm" onClick={() => { setBrowsingGroups(!browsingGroups); setSearch(''); setQuery(''); }}>{browsingGroups ? 'Back to your groups' : 'Find groups to join'}</button>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groupTab ? <>
            <div className="px-2 pb-3"><GroupInvitations changed={groups.reload} /></div>
            {browsingGroups && <p className="px-3 pb-2 text-xs font-semibold text-slate-500">Discover groups</p>}
            {groups.loading && <Loading height={80} />}
            {groups.items.map(group => <Link key={group.groupId} href={`/messages/groups/${group.groupId}`} className={`mb-1 flex items-center gap-3 rounded-xl p-3 ${String(group.groupId) === groupId ? 'bg-teal-50' : 'hover:bg-slate-50'}`}><Avatar name={group.title} avatarUrl={group.imageUrl} size={44} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{group.title}</p><p className="mt-1 truncate text-xs text-slate-500">{group.isMember ? `${group.memberCount} members` : group.joinRequested ? 'Request pending' : 'Discover · Request to join'}</p></div></Link>)}
            {groups.settled && groups.items.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{browsingGroups ? 'No groups found.' : search ? 'No matching groups.' : 'Your joined groups will appear here. Find a group to join or create your own.'}</p>}
            {groups.items.length > 0 && <LoadMore loading={groups.loadingMore} hasMore={groups.hasMore} onLoadMore={groups.loadMore} label="Load more groups" endLabel={null} className="py-1" />}
            {groups.error && <button className="chat-secondary" onClick={groups.reload}>Retry groups</button>}
          </> : <>
            {users.loading && <Loading height={80} />}
            {people?.map(person => <Link key={person.userId} href={`/messages/${person.userId}`} className={`mb-1 flex items-center gap-3 rounded-xl p-3 ${partner === person.userId ? 'bg-teal-50' : 'hover:bg-slate-50'}`}><div className="relative shrink-0"><Avatar name={displayName(person)} avatarUrl={person.avatar} size={44} />{!!person.isOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{displayName(person)}</p><p className="mt-1 text-xs text-slate-500">{person.isOnline ? 'Online now' : person.lastMessageTime ? 'Continue your conversation' : 'Start a conversation'}</p></div></Link>)}
            {people?.length === 0 && <p className="p-4 text-center text-sm text-slate-500">{search ? 'No matching conversations.' : 'Your conversations will appear here after your first message.'}<Link href="/discover" className="mt-3 block font-medium text-teal-700">Start a new conversation</Link></p>}
            {users.error && <button className="chat-secondary" onClick={users.reload}>Retry conversations</button>}
          </>}
        </div>
        <div className="shrink-0 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">Your people. Your communities.</div>
      </aside>
      <div className={`flex min-w-0 flex-1 flex-col ${!active ? 'max-md:hidden' : ''}`}>
        {groupId ? <GroupConversation key={groupId} groupId={groupId} /> : partner ? <DirectConversation key={partner} partner={partner} person={selected} /> : <div className="chat-background flex h-full flex-col items-center justify-center px-8 text-center"><div className="mb-5 rounded-3xl border border-teal-100 bg-white p-6 text-teal-600 shadow-sm">{groupTab ? <Users size={40} strokeWidth={1.5} /> : <MessageCircle size={40} strokeWidth={1.5} />}</div><h2 className="text-2xl font-semibold tracking-tight text-slate-800">{groupTab ? 'Bring your people together' : 'Good conversations start here'}</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-500">{groupTab ? 'Choose a group to chat, share posts, plan events and catch up on the moments you missed.' : 'Pick a person from your conversations to say hello, share a photo or make a plan.'}</p>{groupTab && <button className="chat-primary mt-6" onClick={() => setCreating(true)}>Create a group</button>}</div>}
      </div>
    </div>
    {creating && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="create-group-title" onKeyDown={event => { if (event.key === 'Escape' && !busy) setCreating(false); }}><form onSubmit={create} className="max-h-[90dvh] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><fieldset disabled={busy} className="space-y-5"><div className="flex items-center justify-between"><h2 id="create-group-title" className="text-xl font-semibold">Create a group</h2><button type="button" aria-label="Close create group" onClick={() => setCreating(false)}><X size={20} /></button></div><label className="chat-label">Group name<input autoFocus name="title" required minLength={3} maxLength={100} className="chat-field" placeholder="Give your group a name" /></label><label className="chat-label">Description<textarea name="description" maxLength={1000} rows={3} className="chat-field" placeholder="What brings your group together?" /></label><ImagePicker files={files} onChange={setFiles} max={1} disabled={busy} /><button className="chat-primary w-full">{busy ? 'Creating…' : 'Create group'}</button></fieldset></form></div>}
  </div>;
}
