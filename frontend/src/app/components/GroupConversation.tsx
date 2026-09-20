'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Group, type GroupMember, type GroupRequest, type SocialUser, displayName, errorMessage, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import Avatar from './Avatar';
import ImagePicker from './ImagePicker';
import GroupActivity from './GroupActivity';
import GroupJoinButton from './GroupJoinButton';
import Loading from './Loading';

function GroupInfo({ group, changed }: { group: Group; changed: () => void }) {
  const { user } = useBackend();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [image, setImage] = useState(group.imageUrl);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const members = useResource<GroupMember[]>(`/groups/${group.groupId}/members`);
  const requests = useResource<GroupRequest[]>(`/groups/${group.groupId}/requests`, group.isOwner);
  const people = useResource<SocialUser[]>(`/users?q=${encodeURIComponent(query)}`, !!query);
  useLiveRefresh(members.reload, String(group.groupId));
  useLiveRefresh(requests.reload, String(group.groupId));
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (busy) return; setBusy(true);
    try { await action(); members.reload(); requests.reload(); changed(); toast.success(message); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6"><div className="mx-auto max-w-2xl space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-4"><Avatar name={group.title} avatarUrl={group.imageUrl} size={72} /><div><h3 className="text-xl font-semibold">{group.title}</h3><p className="text-sm text-slate-500">{group.memberCount} members · Created by {group.ownerName}</p></div></div>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm text-slate-600">{group.description || 'Add a description to tell people about your group.'}</p>
      {group.isOwner && <button className="chat-secondary mt-4" onClick={() => { setImage(group.imageUrl); setFiles([]); setEditing(!editing); }}>{editing ? 'Cancel editing' : 'Edit group'}</button>}
      {editing && <form className="mt-4 space-y-4" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void mutate(async () => { const imageUrl = files.length ? (await upload(files[0])).url : image; await request(`/groups/${group.groupId}`, 'PUT', { title: data.get('title'), description: data.get('description'), imageUrl }); setEditing(false); }, 'Group updated');
      }}><fieldset disabled={busy} className="space-y-4"><label className="chat-label">Group name<input name="title" defaultValue={group.title} required minLength={3} maxLength={100} className="chat-field" /></label><label className="chat-label">Description<textarea name="description" defaultValue={group.description} maxLength={1000} className="chat-field" /></label><ImagePicker files={files} onChange={setFiles} existing={image ? [image] : []} onRemoveExisting={() => setImage('')} max={1} disabled={busy} /><button className="chat-primary">{busy ? 'Saving…' : 'Save group'}</button></fieldset></form>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Members</h3>
      {members.loading && <Loading height={70} />}
      <div className="mt-3 divide-y divide-slate-100">{members.data?.map(member => <div key={member.userId} className="flex flex-wrap items-center gap-3 py-3"><Avatar name={displayName(member)} avatarUrl={member.avatar} size={36} /><Link href={`/profile/${member.userId}`} className="min-w-0 flex-1 text-sm font-medium">{displayName(member)}{member.userId === user.userId ? ' (you)' : ''}<span className="block text-xs font-normal capitalize text-slate-400">{member.role}</span></Link>{group.isOwner && member.role !== 'owner' && <details className="relative"><summary className="cursor-pointer text-xs text-slate-500">Manage</summary><div className="absolute right-0 z-10 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button disabled={busy} className="chat-menu text-xs" onClick={() => void mutate(() => request(`/groups/${group.groupId}/members/${member.userId}`, 'PUT', { role: 'owner' }), 'Group ownership transferred')}>Make group owner</button><button disabled={busy} className="chat-menu text-xs text-red-600" onClick={() => void mutate(() => request(`/groups/${group.groupId}/members/${member.userId}`, 'DELETE'), 'Member removed')}>Remove member</button></div></details>}</div>)}</div>
      <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); }}><input aria-label="Find people to invite" placeholder="Find people to invite" value={search} onChange={event => setSearch(event.target.value)} className="chat-field mt-0 min-w-0 flex-1" /><button className="chat-secondary">Find</button></form>
      {!!query && <div className="mt-3 space-y-2">{people.loading && <Loading height={60} />}{people.data?.filter(person => !members.data?.some(member => member.userId === person.userId)).map(person => <div key={person.userId} className="flex items-center justify-between gap-2 text-sm"><span>{displayName(person)}</span><button disabled={busy} className="chat-secondary" onClick={() => void mutate(() => request(`/groups/${group.groupId}/invite/${person.userId}`, 'POST'), 'Invitation sent')}>Invite</button></div>)}{people.data?.length === 0 && <p className="text-sm text-slate-500">No people found.</p>}</div>}
    </section>
    {group.isOwner && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">Join requests</h3>{requests.data?.length ? requests.data.map(item => <div key={item.requestId} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span>{item.nickname}</span><div className="flex gap-2">{['accepted', 'declined'].map(status => <button key={status} disabled={busy} className="chat-secondary" onClick={() => void mutate(() => request(`/groups/${group.groupId}/requests/${item.requestId}`, 'PUT', { status }), status === 'accepted' ? 'Member added' : 'Request declined')}>{status === 'accepted' ? 'Accept' : 'Decline'}</button>)}</div></div>) : <p className="mt-3 text-sm text-slate-500">No pending requests.</p>}</section>}
    <section className="rounded-2xl border border-red-100 bg-white p-5">
      <button className="text-sm font-medium text-red-600" onClick={() => setConfirm(group.isOwner ? 'delete' : 'leave')}>{group.isOwner ? 'Delete group' : 'Leave group'}</button>
      {group.isOwner && <p className="mt-2 text-xs text-slate-500">To leave without deleting the group, transfer ownership to a member first.</p>}
      {confirm && <div className="mt-3 space-y-3"><p className="text-sm text-slate-600">{confirm === 'delete' ? 'Delete this group and all its messages, posts and events? This cannot be undone.' : 'Leave this group? You will need an invitation or approval to rejoin.'}</p><div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white" onClick={() => void mutate(async () => { await request(confirm === 'delete' ? `/groups/${group.groupId}` : `/groups/${group.groupId}/members/${user.userId}`, 'DELETE'); router.push('/messages/groups'); }, confirm === 'delete' ? 'Group deleted' : 'You left the group')}>{confirm === 'delete' ? 'Delete permanently' : 'Leave group'}</button><button className="chat-secondary" onClick={() => setConfirm(null)}>Cancel</button></div></div>}
    </section>
  </div></div>;
}

export default function GroupConversation({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState('timeline');
  const group = useResource<Group>(`/groups/${groupId}`);
  useLiveRefresh(group.reload, groupId);
  if (group.loading) return <Loading />;
  if (!group.data) return <div className="m-auto space-y-3 p-6 text-center text-slate-500"><p>This group is unavailable.</p><Link href="/messages/groups" className="chat-secondary">Back to groups</Link></div>;
  const data = group.data;
  return <section className="flex h-full min-h-0 flex-1 flex-col" aria-label={`Group conversation: ${data.title}`}>
    <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white p-4"><Link href="/messages/groups" aria-label="Back to groups" className="chat-icon md:hidden"><ArrowLeft size={20} /></Link><button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setTab('info')}><Avatar name={data.title} avatarUrl={data.imageUrl} /><span className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{data.title}</h2><span className="text-xs text-slate-500">{data.isMember ? `${data.memberCount} members · Group conversation` : data.joinRequested ? 'Request pending' : `${data.memberCount} members · Request to join`}</span></span></button><button aria-label="Group info" className="chat-icon" onClick={() => setTab('info')}><Info size={20} /></button></header>
    {data.isMember ? <><nav aria-label="Group conversation tabs" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3">{[['timeline', 'Chat'], ['posts', 'Posts'], ['events', 'Events'], ['media', 'Media'], ['info', 'Group info']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${tab === value ? 'border-teal-600 font-semibold text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</nav>{tab === 'info' ? <GroupInfo group={data} changed={group.reload} /> : <GroupActivity key={tab} groupId={groupId} kind={tab} isOwner={data.isOwner} />}</> : <div className="m-auto max-w-lg space-y-4 p-6 text-center"><Avatar name={data.title} avatarUrl={data.imageUrl} size={80} /><h3 className="text-xl font-semibold">Join {data.title}</h3><p className="text-sm text-slate-500">{data.description}</p><p className="text-sm text-slate-500">Join this group to see its conversations, posts, events and media.</p><GroupJoinButton group={data} onRequested={() => { group.update(value => ({ ...value, joinRequested: true })); group.reload(); }} /></div>}
  </section>;
}
