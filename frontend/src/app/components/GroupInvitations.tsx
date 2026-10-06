'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { type GroupInvitation, errorMessage, request } from '../api/social';
import Button from './ui/Button';
import { useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';

/**
 * Pending invitations, sitting under the group list. Each one is a compact card — the
 * group, why it is here, and the two answers — sized for the narrow conversation column
 * rather than the full-width row it used to be.
 */
export default function GroupInvitations({ changed }: { changed: () => void }) {
 const invitations = useResource<GroupInvitation[]>('/groups/invitations');
 useLiveRefresh(invitations.reload);
 const [busy,setBusy]=useState(false);
 async function decide(item: GroupInvitation,status: string) {
  setBusy(true);
  try { await request(`/groups/${item.groupId}/invitations/${item.invitationId}`,'PUT',{status}); invitations.reload();changed();window.dispatchEvent(new Event('social:notifications')); }
  catch(error){toast.error(errorMessage(error));}finally{setBusy(false);}
 }
 if (!invitations.data?.length) return null;
 return <section aria-label="Group invitations" className="grp-invites">
  <h2 className="grp-invites-label">Your invitations</h2>
  {invitations.data.map(item=><div key={item.invitationId} className="grp-invite">
   <div className="min-w-0">
    <span className="grp-invite-title truncate" dir="auto">{item.groupTitle}</span>
    <span className="grp-invite-sub">Invited you to join</span>
   </div>
   <div className="grp-invite-actions">
    <Button variant="secondary" disabled={busy} onClick={()=>void decide(item,'accepted')}>Accept</Button>
    <Button variant="secondary" disabled={busy} onClick={()=>void decide(item,'declined')}>Decline</Button>
   </div>
  </div>)}
 </section>;
}
