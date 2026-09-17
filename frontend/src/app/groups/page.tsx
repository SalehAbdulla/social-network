'use client';

import Link from 'next/link';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { type Group, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import GroupInvitations from '../components/GroupInvitations';
import Loading from '../components/Loading';
import RequestState from '../components/RequestState';
import GroupJoinButton from '../components/GroupJoinButton';

export default function Groups() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<Group | null>(null);
  const groups = useResource<Group[]>(`/groups?q=${encodeURIComponent(search)}`);
  const visibleGroups = [...(groups.data || [])];
  if (createdGroup && !search && !visibleGroups.some(group => group.groupId === createdGroup.groupId)) visibleGroups.unshift(createdGroup);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const group = await request<Group>('/groups', 'POST', { title: values.title, description: values.description });
      setCreatedGroup(group); setInput(''); setSearch('');
      form.reset(); setShowCreate(false); groups.reload(); toast.success('Group created');
    } catch (error) { toast.error(errorMessage(error)); } finally { setCreating(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">Groups</h1><p className="mt-1 text-slate-500">Find communities or create one of your own.</p></div><button onClick={() => setShowCreate(!showCreate)} className="rounded-lg bg-blue-600 px-4 py-2 text-white">{showCreate ? 'Close' : 'Create group'}</button></div>
    <GroupInvitations changed={groups.reload} />
    {showCreate && <form onSubmit={create} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"><label className="block text-sm font-medium">Title<input name="title" required minLength={3} maxLength={100} className="mt-1 w-full rounded-lg border p-3" /></label><label className="block text-sm font-medium">Description<textarea name="description" maxLength={1000} className="mt-1 w-full rounded-lg border p-3" /></label><button disabled={creating} className="rounded-lg bg-teal-600 px-4 py-2 text-white disabled:opacity-50">{creating ? 'Creating...' : 'Create group'}</button></form>}
    <form onSubmit={event => { event.preventDefault(); setSearch(input); }} className="flex gap-3"><input aria-label="Search groups" value={input} onChange={event => setInput(event.target.value)} placeholder="Search groups" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-3" /><button className="rounded-lg bg-slate-900 px-5 text-white">Search</button></form>
    {groups.loading && !visibleGroups.length && <Loading />}{groups.error && <RequestState error={groups.error} retry={groups.reload} />}
    <div className="grid gap-4 md:grid-cols-2">{visibleGroups.map(group => <article key={group.groupId} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><Link href={`/groups/${group.groupId}`} className="text-xl font-semibold text-slate-900 hover:text-blue-700">{group.title}</Link><p className="mt-2 text-sm text-slate-600">{group.description || 'No description yet.'}</p></div><span className="whitespace-nowrap text-sm text-slate-500">{group.memberCount} member{group.memberCount === 1 ? '' : 's'}</span></div><div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-500">Created by {group.ownerName || 'Unknown'}</span><GroupJoinButton group={group} onRequested={() => groups.update(items => items.map(item => item.groupId === group.groupId ? { ...item, joinRequested: true } : item))} /></div></article>)}</div>
    {groups.data && visibleGroups.length === 0 && <RequestState empty="No groups found." />}
  </div>;
}
