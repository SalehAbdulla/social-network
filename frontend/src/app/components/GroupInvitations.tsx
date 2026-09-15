'use client';
import { useState } from 'react';
import { type GroupInvitation, errorMessage, request } from '../api/social';
import { useResource } from '../lib/useResource';
import RequestState from './RequestState';
export default function GroupInvitations({ changed }: { changed: () => void }) {
 const invitations = useResource<GroupInvitation[]>('/groups/invitations');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 async function decide(item: GroupInvitation,status: string) {
  setBusy(true);setError('');
  try { await request(`/groups/${item.groupId}/invitations/${item.invitationId}`,'PUT',{status}); invitations.reload();changed();window.dispatchEvent(new Event('social:notifications')); }
  catch(error){setError(errorMessage(error));}finally{setBusy(false);}
 }
 return <section aria-label="Group invitations" className="space-y-3">{(error||invitations.error)&&<RequestState error={error||invitations.error} retry={invitations.reload}/>}{!!invitations.data?.length&&<h2 className="text-xl font-semibold">Your invitations</h2>}{invitations.data?.map(item=><div key={item.invitationId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><span>{item.groupTitle}</span><div className="flex gap-3"><button disabled={busy} onClick={()=>void decide(item,'accepted')} className="rounded bg-teal-700 px-4 py-2 text-white">Accept invitation</button><button disabled={busy} onClick={()=>void decide(item,'declined')} className="rounded border px-4 py-2">Decline invitation</button></div></div>)}</section>;
}
