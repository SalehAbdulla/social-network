'use client';

import { useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { type GroupMember, errorMessage, request } from '../../../api/social';
import { usePagedList } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { useLiveRefresh } from '../../../lib/useLiveRefresh';
import Button from '../../ui/Button';
import MediaImage from '../../ui/MediaImage';
import { GroupMediaSkeleton } from '../../Skeletons';
import LoadMore from '../../LoadMore';
import { GROUP_PAGE_SIZE, isVideo, type GroupItem } from './groupContent';
import GroupLightbox from './GroupLightbox';

/**
 * The Media tab: the Instagram-profile grid, and the viewer a tile opens.
 *
 * Every attachment in the group — a chat photo, a post's image, anything with a URL — arrives
 * from the same media kind, so the grid is one flat set of 3:4 crops in a 935px column. The
 * viewer is the shared `GroupLightbox`, so a tile here and a photo in the chat open the same
 * thing: Escape, the arrow keys, a focus trap and focus returned to the tile that was clicked.
 */
export default function GroupMedia({ groupId, meId, isOwner, onCreate }: {
  groupId: string;
  meId: string;
  isOwner: boolean;
  onCreate: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const resource = usePagedList<GroupItem, GroupItem[]>({
    key: `/groups/${groupId}/content/media?parentId=0`,
    pageQuery: page => `&offset=${(page - 1) * GROUP_PAGE_SIZE}`,
    pageSize: GROUP_PAGE_SIZE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.id,
  });
  // The uploader's avatar is not on a content row, so the roster is read alongside the grid.
  const members = useResource<GroupMember[]>(`/groups/${groupId}/members`);
  const roster = useMemo(() => new Map((members.data ?? []).map(member => [member.userId, member.avatar])), [members.data]);
  useLiveRefresh(resource.refresh, groupId);
  useLiveRefresh(members.reload, groupId);
  // Removing a tile is optimistic: it disappears at once and comes back if the write fails.
  async function remove(item: GroupItem) {
    const previous = resource.items;
    resource.update(items => items.filter(entry => entry.id !== item.id));
    setOpen(null);
    try {
      await request(`/groups/${groupId}/content/${item.kind}/${item.id}?parentId=${item.parentId}`, 'DELETE');
    } catch (error) {
      resource.update(() => previous);
      toast.error(errorMessage(error));
    }
  }
  return <div className="grp-body">
    <div className="grp-column-media">
      {resource.loading && <GroupMediaSkeleton />}
      {!!resource.error && <div className="grp-error" role="alert">
        <span>{resource.error}</span>
        <Button variant="secondary" onClick={resource.reload}>Retry</Button>
      </div>}
      {resource.settled && !resource.error && resource.items.length === 0 && <div className="grp-empty">
        <ImageIcon aria-hidden="true" />
        <p className="grp-empty-title">No photos yet</p>
        <p className="grp-empty-text">Photos shared in this group appear here.</p>
        <Button onClick={onCreate}>Add photo</Button>
      </div>}
      {resource.items.length > 0 && <div className="grp-media-grid">
        {resource.items.map((item, index) => <button key={item.id} type="button" className="grp-media-cell" aria-label={`Open attachment ${index + 1} of ${resource.items.length}`} onClick={() => setOpen(index)}>
          {isVideo(item.mediaUrl)
            ? <video src={item.mediaUrl} muted />
            : <MediaImage url={item.mediaUrl} alt={`Attachment ${index + 1}`} sizes="(max-width: 640px) 33vw, 312px" />}
          <span className="grp-media-overlay" aria-hidden="true" />
        </button>)}
      </div>}
      <LoadMore loading={resource.loadingMore} hasMore={resource.hasMore} onLoadMore={resource.loadMore} endLabel={null} />
    </div>
    {open !== null && <GroupLightbox
      items={resource.items}
      index={open}
      meId={meId}
      isOwner={isOwner}
      avatarOf={userId => roster.get(userId) ?? ''}
      onClose={() => setOpen(null)}
      onIndex={setOpen}
      onDelete={item => void remove(item)}
    />}
  </div>;
}
