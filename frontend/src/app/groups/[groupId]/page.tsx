'use client';

import { useState } from 'react';
import GroupActivity from '../../components/GroupActivity';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { type Group, type GroupMember, type GroupRequest, errorMessage, request } from '../../api/social';
import { useResource } from '../../lib/useResource';
import Loading from '../../components/Loading';
import RequestState from '../../components/RequestState';

export default function GroupDetails() {
  const { groupId } = useParams<{ groupId: string }>();
  const [inviting,setInviting]=useState(false);
  async function invite(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=event.currentTarget;const userId=String(new FormData(form).get('userId')||'').trim();setInviting(true);
    try {await request(`/groups/${groupId}/invite/${encodeURIComponent(userId)}`,'POST');form.reset();toast.success('Invitation sent');}catch(error){toast.error(errorMessage(error));}finally{setInviting(false);}
  }
  const group = useResource<Group>(`/groups/${groupId}`);
  const members = useResource<GroupMember[]>(`/groups/${groupId}/members`);
  const requests = useResource<GroupRequest[]>(`/groups/${groupId}/requests`);
  async function decide(requestID: number, status: string) {
    try { await request(`/groups/${groupId}/requests/${requestID}`, 'PUT', { status }); requests.reload(); members.reload(); group.reload(); }
    catch (error) { toast.error(errorMessage(error)); }
  }
  if (group.loading) return <Loading />;
  if (group.error) return <RequestState error={group.error} retry={group.reload} />;
  if (!group.data) return null;
  return <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8"><div className="rounded-xl border border-slate-200 bg-white p-6"><h1 className="text-3xl font-bold">{group.data.title}</h1><p className="mt-3 text-slate-600">{group.data.description || 'No description yet.'}</p><p className="mt-4 text-sm text-slate-500">Created by {group.data.ownerName} · {group.data.memberCount} members</p></div>{group.data.isMember ? <><GroupActivity groupId={groupId}/><form onSubmit={invite} className="space-y-3 rounded-xl border bg-white p-6"><label className="block font-medium">Invite a user<input name="userId" required placeholder="User ID from their profile URL" className="mt-2 block w-full rounded border p-3"/></label><button disabled={inviting} className="rounded bg-teal-700 px-4 py-2 text-white">{inviting?'Inviting?':'Send invitation'}</button></form><section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Members</h2>{members.loading ? <Loading height={80} /> : members.error ? <RequestState error={members.error} retry={members.reload}/> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{members.data?.map(member => <div key={member.userId} className="rounded-lg bg-slate-50 p-3"><p className="font-medium">{member.firstName} {member.lastName}</p><p className="text-sm text-slate-500">@{member.nickname} · {member.role}</p></div>)}</div>}</section>{group.data.isOwner && <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Join requests</h2>{requests.error ? <RequestState error={requests.error} retry={requests.reload} /> : requests.data?.length ? <div className="mt-4 space-y-3">{requests.data.map(item => <div key={item.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><span>@{item.nickname}</span><div className="flex gap-2"><button onClick={() => void decide(item.requestId, 'accepted')} className="rounded-lg bg-teal-600 px-3 py-2 text-sm text-white">Accept</button><button onClick={() => void decide(item.requestId, 'declined')} className="rounded-lg border px-3 py-2 text-sm">Decline</button></div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No pending requests.</p>}</section>}</> : <RequestState empty="You must be a member to view the group members." />}</div>;
}