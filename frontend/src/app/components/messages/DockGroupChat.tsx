'use client';

import Link from 'next/link';
import { type Group } from '../../api/social';
import { useResource } from '../../lib/useResource';
import { useBackend } from '../BackendProvider';
import DockHeader from './DockHeader';
import GroupChat from './group/GroupChat';
import { memberCount } from './group/groupContent';

export default function DockGroupChat({ groupId, onBack, onExpand, onClose, onOpenGroup }: {
  groupId: string;
  onBack: () => void;
  onExpand: () => void;
  onClose: () => void;
  onOpenGroup: () => void;
}) {
  const { user } = useBackend();
  const group = useResource<Group>(`/groups/${groupId}`);
  const data = group.data;
  const name = data?.title ?? 'Group';
  return <>
    <DockHeader
      name={name}
      handle=""
      avatar={data?.imageUrl ?? ''}
      online={false}
      profileHref={`/groups/${groupId}`}
      sub={data ? memberCount(data.memberCount) : ''}
      onBack={onBack}
      onExpand={onExpand}
      onClose={onClose}
      action={<Link href={`/groups/${groupId}`} className="dock-open-group">Open group</Link>}
    />
    {group.loading
      ? <div className="dock-scroll"><div className="dock-row-skel"><span className="dock-skel dock-skel-face" /></div></div>
      : data?.isMember
        ? <GroupChat groupId={groupId} meId={user.userId} isOwner={data.isOwner} onOpenEvents={onOpenGroup} onEdit={onOpenGroup} />
        : <div className="dock-empty">
          <p>Join this group to read its messages.</p>
          <Link href={`/groups/${groupId}`} className="dock-primary">Open group</Link>
        </div>}
  </>;
}
