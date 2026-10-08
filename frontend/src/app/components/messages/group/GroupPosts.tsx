'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage, request, type GroupMember, type Post } from '../../../api/social';
import { usePagedList } from '../../../lib/usePagedList';
import { useResource } from '../../../lib/useResource';
import { useLiveRefresh } from '../../../lib/useLiveRefresh';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import Button from '../../ui/Button';
import { MenuItem } from '../../PopoverMenu';
import { GroupPostsSkeleton } from '../../Skeletons';
import LoadMore from '../../LoadMore';
import PostCard from '../../PostCard';
import { usePostModal } from '../../../lib/usePostModal';
import { GROUP_PAGE_SIZE, type GroupItem } from './groupContent';
import GroupComments, { useGroupComments, GroupThread } from './GroupComments';

function toPost(item: GroupItem): Post {
  return {
    postId: String(item.id),
    userId: item.userId,
    nickname: item.nickname,
    firstName: item.firstName,
    lastName: item.lastName,
    title: '',
    content: item.content,
    imageUrls: item.mediaUrl ? [item.mediaUrl] : [],
    privacy: 'public',
    score: item.likeCount,
    userScore: item.likedByMe ? 1 : 0,
    commentsCounter: 0,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    isSaved: false,
  };
}

function GroupPostRow({ item, groupId, meId, isOwner, avatarOf, highlight, onOpen, onEdit, onDelete }: {
  item: GroupItem;
  groupId: string;
  meId: string;
  isOwner: boolean;
  avatarOf: (userId: string) => string;
  highlight: boolean;
  onOpen?: () => void;
  onEdit: (item: GroupItem) => void;
  onDelete: (item: GroupItem) => void;
}) {
  const comments = useGroupComments(groupId, item.id);
  return <PostCard
    context="group"
    post={toPost(item)}
    sharePath={`/messages/groups/${groupId}?tab=posts&post=${item.id}`}
    highlight={highlight}
    comments={<GroupComments groupId={groupId} postId={item.id} meId={meId} isOwner={isOwner} comments={comments} avatarOf={avatarOf} />}
    commentCount={comments.items.length}
    canManage={item.userId === meId || isOwner}
    avatarOf={avatarOf}
    onOpen={onOpen}
    menuItems={<>
      {item.userId === meId && <MenuItem onClick={() => onEdit(item)}><Pencil size={20} aria-hidden="true" />Edit</MenuItem>}
      <MenuItem danger onClick={() => onDelete(item)}><Trash2 size={20} aria-hidden="true" />Delete</MenuItem>
    </>}
  />;
}

export default function GroupPosts({ groupId, meId, isOwner, highlightId, onCreate, onEdit }: {
  groupId: string;
  meId: string;
  isOwner: boolean;
  highlightId: number | null;
  onCreate: () => void;
  onEdit: (item: GroupItem) => void;
}) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const resource = usePagedList<GroupItem, GroupItem[]>({
    key: `/groups/${groupId}/content/posts?parentId=0`,
    pageQuery: page => `&offset=${(page - 1) * GROUP_PAGE_SIZE}`,
    pageSize: GROUP_PAGE_SIZE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.id,
  });
  const members = useResource<GroupMember[]>(`/groups/${groupId}/members`);
  const roster = useMemo(() => new Map((members.data ?? []).map(member => [member.userId, member.avatar])), [members.data]);
  const avatarOf = useMemo(() => (userId: string) => roster.get(userId) ?? '', [roster]);
  useLiveRefresh(resource.refresh, groupId);
  useLiveRefresh(members.reload, groupId);

  async function remove(item: GroupItem) {
    const previous = resource.items;
    resource.update(items => items.filter(entry => entry.id !== item.id));
    try {
      await request(`/groups/${groupId}/content/${item.kind}/${item.id}?parentId=${item.parentId}`, 'DELETE');
    } catch (error) {
      resource.update(() => previous);
      toast.error(errorMessage(error));
    }
  }

  const posts = useMemo(() => resource.items.map(toPost), [resource.items]);
  const { openFor, modal } = usePostModal(posts, postId => resource.update(items => items.filter(entry => String(entry.id) !== postId)), post => {
    const item = resource.items.find(entry => String(entry.id) === post.postId);
    if (!item) return {};
    return {
      group: true,
      avatarOf,
      canManage: item.userId === meId || isOwner,
      sharePath: `/messages/groups/${groupId}?tab=posts&post=${item.id}`,
      thread: <GroupThread groupId={groupId} postId={item.id} meId={meId} isOwner={isOwner} avatarOf={avatarOf} />,
      onEdit: () => onEdit(item),
      onDelete: () => void remove(item),
    };
  });

  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightId || !resource.settled) return;
    const target = body.current?.querySelector<HTMLElement>(`[data-post-id="${highlightId}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlightId, resource.settled]);

  return <div className="grp-body" ref={body}>
    <div className="grp-column-posts">
      {resource.loading && <GroupPostsSkeleton />}
      {!!resource.error && <div className="grp-error" role="alert">
        <span>{resource.error}</span>
        <Button variant="secondary" onClick={resource.reload}>Retry</Button>
      </div>}
      {resource.settled && !resource.error && resource.items.length === 0 && <div className="grp-empty">
        <p className="grp-empty-title">No posts yet</p>
        <p className="grp-empty-text">Share something with the group.</p>
        <Button onClick={onCreate}>New post</Button>
      </div>}
      <div className="space-y-[var(--post-spacing)]">
        {resource.items.map(item => <GroupPostRow key={item.id} item={item} groupId={groupId} meId={meId} isOwner={isOwner} avatarOf={avatarOf} highlight={item.id === highlightId} onOpen={wide ? openFor(toPost(item)) : undefined} onEdit={onEdit} onDelete={entry => void remove(entry)} />)}
      </div>
      <LoadMore loading={resource.loadingMore} hasMore={resource.hasMore} onLoadMore={resource.loadMore} endLabel={null} />
    </div>
    {modal}
  </div>;
}

