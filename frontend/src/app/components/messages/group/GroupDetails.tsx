'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Group, type GroupMember, type GroupRequest, type SocialUser, displayName, errorMessage, request, upload } from '../../../api/social';
import { useDialogFocus } from '../../../lib/useDialogFocus';
import { usePagedList } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { useLiveRefresh } from '../../../lib/useLiveRefresh';
import Avatar from '../../Avatar';
import Button from '../../ui/Button';
import Menu, { MenuItem } from '../../ui/Menu';
import ImagePicker from '../../ImagePicker';
import Loading from '../../Loading';
import LoadMore from '../../LoadMore';

const MEMBER_PAGE = 30;

export default function GroupDetails({ group, meId, changed, onClose }: {
  group: Group;
  meId: string;
  changed: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [image, setImage] = useState(group.imageUrl);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null);
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const confirmDialog = useDialogFocus<HTMLDivElement>(() => setConfirm(null), { enabled: confirm !== null });
  const members = usePagedList<GroupMember, GroupMember[]>({
    key: `/groups/${group.groupId}/members`,
    pageQuery: page => `?offset=${(page - 1) * MEMBER_PAGE}`,
    pageSize: MEMBER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: member => member.userId,
  });
  const requests = usePagedList<GroupRequest, GroupRequest[]>({
    key: `/groups/${group.groupId}/requests`,
    pageQuery: page => `?offset=${(page - 1) * MEMBER_PAGE}`,
    pageSize: MEMBER_PAGE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.requestId,
    enabled: group.isOwner,
  });
  const people = useResource<SocialUser[]>(`/users?q=${encodeURIComponent(query)}`, !!query);
  useLiveRefresh(members.refresh, String(group.groupId));
  useLiveRefresh(requests.refresh, String(group.groupId));
  async function mutate(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    try { await action(); members.reload(); requests.reload(); changed(); toast.success(message); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  return <aside className="dm-details" id="group-details" aria-label="Group details">
    <div className="dm-details-head">
      <span className="dm-header-name min-w-0 flex-1 truncate">Details</span>
      <button type="button" aria-label="Close details" className="dm-icon" onClick={onClose}><X aria-hidden="true" /></button>
    </div>
    <div className="dm-details-body">
      <div className="grp-profile">
        <Avatar name={group.title} avatarUrl={group.imageUrl} size={96} />
        <h2 className="grp-profile-name truncate" dir="auto">{group.title}</h2>
        <p className="grp-profile-desc" dir="auto">{group.description || 'Add a description to tell people about your group.'}</p>
        {group.isOwner && !editing && <Button variant="secondary" onClick={() => { setImage(group.imageUrl); setFiles([]); setEditing(true); }}>Edit</Button>}
      </div>
      {editing && <form className="mt-4 flex flex-col gap-3" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void mutate(async () => {
          const imageUrl = files.length ? (await upload(files[0])).url : image;
          await request(`/groups/${group.groupId}`, 'PUT', { title: data.get('title'), description: data.get('description'), imageUrl });
          setEditing(false);
        }, 'Group updated');
      }}>
        <label className="grp-field">Group name<input name="title" defaultValue={group.title} required minLength={3} maxLength={100} /></label>
        <label className="grp-field">Description<textarea name="description" defaultValue={group.description} maxLength={1000} rows={3} /></label>
        <ImagePicker files={files} onChange={setFiles} existing={image ? [image] : []} onRemoveExisting={() => setImage('')} max={1} disabled={busy} />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          <Button type="submit" loading={busy}>Save group</Button>
        </div>
      </form>}

      <span className="dm-details-label mt-6">Members ({group.memberCount})</span>
      {members.loading && <Loading height={60} />}
      {members.items.map(member => <div key={member.userId} className="grp-member">
        <Avatar name={displayName(member)} avatarUrl={member.avatar} size={40} />
        <Link href={`/profile/${member.userId}`} className="min-w-0 flex-1">
          <span className="grp-member-name truncate">{displayName(member)}{member.userId === meId ? ' (you)' : ''}</span>
          <span className="grp-member-handle truncate">{member.nickname}</span>
        </Link>
        {member.role !== 'member' && <span className="grp-badge capitalize">{member.role === 'owner' ? 'Admin' : member.role}</span>}
        {group.isOwner && member.role !== 'owner' && <Menu label="Member actions">
          <MenuItem disabled={busy} onClick={() => void mutate(() => request(`/groups/${group.groupId}/members/${member.userId}`, 'PUT', { role: 'owner' }), 'Group ownership transferred')}>Make group owner</MenuItem>
          <MenuItem tone="danger" disabled={busy} onClick={() => void mutate(() => request(`/groups/${group.groupId}/members/${member.userId}`, 'DELETE'), 'Member removed')}>Remove member</MenuItem>
        </Menu>}
      </div>)}
      <LoadMore loading={members.loadingMore} hasMore={members.hasMore} onLoadMore={members.loadMore} label="Load more members" endLabel={null} />

      {group.isOwner && <>
        <span className="dm-details-label mt-6">Join requests</span>
        {requests.items.length === 0 && <p className="grp-empty-text">No pending requests.</p>}
        {requests.items.map(item => <div key={item.requestId} className="grp-member">
          <span className="grp-member-name min-w-0 flex-1 truncate">{item.nickname}</span>
          <div className="flex flex-none gap-2">
            {['accepted', 'declined'].map(status => <Button key={status} variant="secondary" disabled={busy} onClick={() => void mutate(() => request(`/groups/${group.groupId}/requests/${item.requestId}`, 'PUT', { status }), status === 'accepted' ? 'Member added' : 'Request declined')}>{status === 'accepted' ? 'Accept' : 'Decline'}</Button>)}
          </div>
        </div>)}
        <LoadMore loading={requests.loadingMore} hasMore={requests.hasMore} onLoadMore={requests.loadMore} label="Load more requests" endLabel={null} />
      </>}

      <div className="grp-rows">
        <button type="button" className="grp-row-action" data-tone="blue" aria-expanded={inviting} onClick={() => setInviting(value => !value)}>Add people</button>
        <button type="button" className="grp-row-action" data-tone="danger" onClick={() => setConfirm(group.isOwner ? 'delete' : 'leave')}>{group.isOwner ? 'Delete group' : 'Leave group'}</button>
      </div>
      {group.isOwner && <p className="grp-empty-text mt-3">To leave without deleting the group, transfer ownership to a member first.</p>}

      {inviting && <>
        <form className="grp-comment-form" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); }}>
          <label className="grp-comment-field">
            <span className="sr-only">Find people to invite</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find people to invite" />
          </label>
          <button className="grp-text-action">Find</button>
        </form>
        {!!query && <div>
          {people.loading && <Loading height={50} />}
          {people.data?.filter(person => !members.items.some(member => member.userId === person.userId)).map(person => <div key={person.userId} className="grp-member">
            <span className="grp-member-name min-w-0 flex-1 truncate">{displayName(person)}</span>
            <Button variant="secondary" disabled={busy} onClick={() => void mutate(() => request(`/groups/${group.groupId}/invite/${person.userId}`, 'POST'), 'Invitation sent')}>Invite</Button>
          </div>)}
          {people.data?.length === 0 && <p className="grp-empty-text">No people found.</p>}
        </div>}
      </>}
    </div>

    {confirm && <div className="dm-modal" onClick={() => setConfirm(null)}>
      <div ref={confirmDialog} role="dialog" aria-modal="true" aria-labelledby="grp-confirm" tabIndex={-1} className="dm-modal-card p-4" onClick={event => event.stopPropagation()}>
        <p id="grp-confirm" className="text-sm text-text">
          {confirm === 'delete' ? 'Delete this group and all its messages, posts and events? This cannot be undone.' : 'Leave this group? You will need an invitation or approval to rejoin.'}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => void mutate(async () => {
            await request(confirm === 'delete' ? `/groups/${group.groupId}` : `/groups/${group.groupId}/members/${meId}`, 'DELETE');
            router.push('/messages/groups');
          }, confirm === 'delete' ? 'Group deleted' : 'You left the group')}>{confirm === 'delete' ? 'Delete permanently' : 'Leave group'}</Button>
        </div>
      </div>
    </div>}
  </aside>;
}
