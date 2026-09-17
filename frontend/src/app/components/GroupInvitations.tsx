'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { type GroupInvitation, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
export default function GroupInvitations({ changed }: { changed: () => void }) {
 const invitations = useResource<GroupInvitation[]>('/groups/invitations');
 const [busy,setBusy]=useState(false);
 async function decide(item: GroupInvitation,status: string) {
  setBusy(true);
  try { await request(`/groups/${item.groupId}/invitations/${item.invitationId}`,'PUT',{status}); invitations.reload();changed();window.dispatchEvent(new Event('social:notifications')); }
  catch(error){toast.error(errorMessage(error));}finally{setBusy(false);}
 }
 return <section aria-label="Group invitations" className="space-y-3">{!!invitations.data?.length&&<h2 className="text-xl font-semibold">Your invitations</h2>}{invitations.data?.map(item=><div key={item.invitationId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><span>{item.groupTitle}</span><div className="flex gap-3"><button disabled={busy} onClick={()=>void decide(item,'accepted')} className="rounded bg-teal-700 px-4 py-2 text-white">Accept invitation</button><button disabled={busy} onClick={()=>void decide(item,'declined')} className="rounded border px-4 py-2">Decline invitation</button></div></div>)}</section>;
}
