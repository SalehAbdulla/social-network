'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type Group, errorMessage, request } from '../api/social';
import Button from './ui/Button';

export default function GroupJoinButton({ group, onRequested }: { group: Group; onRequested: () => void }) {
  const [busy, setBusy] = useState(false);
  async function join() {
    if (busy || group.joinRequested) return;
    setBusy(true);
    try {
      await request(`/groups/${group.groupId}/join`, 'POST');
      onRequested();
      window.dispatchEvent(new CustomEvent('social:group-requested', { detail: { groupId: group.groupId } }));
      toast.success('Join request sent');
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  if (group.isMember) return <span className="grp-badge">Member</span>;
  return <Button loading={busy} disabled={group.joinRequested} onClick={() => void join()} className="grp-gate-action">
    {group.joinRequested ? 'Request pending' : 'Request to join'}
  </Button>;
}
