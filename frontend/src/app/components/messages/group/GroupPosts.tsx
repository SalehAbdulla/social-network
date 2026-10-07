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

/**
 * The adapter: one group content row, read as the `Post` the feed's card draws.
 *
 * The two agree on who wrote the post, what it says and when, which is all the card reads from a
 * `Post` on its own. The row's single file travels as the post's own `imageUrls`, so the feed's
 * media grid draws it exactly as it draws a feed post. Everything else the group answers
 * differently travels as props — the thread, the count, the author's avatar and the two menu rows.
 */
function toPost(item: GroupItem): Post {
  return {
    postId: item.id,
    userId: item.userId,
    nickname: item.nickname,
    firstName: item.firstName,
    lastName: item.lastName,
    title: '',
    content: item.content,
    // The row's one file is the one photo the card draws, so it travels as the post's own
    // `imageUrls` and the feed's media grid renders it without a group branch.
    imageUrls: item.mediaUrl ? [item.mediaUrl] : [],
    privacy: 'public',
    // The group's own likes, carried in the feed's two fields so the card needs no branch: the
    // server's total and whether this reader is one of the likers (its flag is 0/1, the score
    // shape the card already toggles).
    score: item.likeCount,
    userScore: item.likedByMe ? 1 : 0,
    // A group row carries no bookmark and no comment total of its own.
    commentsCounter: 0,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    isSaved: false,
  };
}

/**
 * One post, drawn by the feed's own `PostCard` through its `context="group"` path.
 *
 * Nothing is restyled here: the header, the description, the media grid, the action row, the
 * divider and the type scale all come from that one component and the same CSS variables. What
 * this adapter supplies is the data the group has instead — its own thread, its own count, the
 * roster the avatars are resolved from, and the two menu rows that run on the group's endpoints.
 * The card omits the bookmark itself, since a group post is not in the saved list.
 */
function GroupPostRow({ item, groupId, meId, isOwner, avatarOf, highlight, onOpen, onEdit, onDelete }: {
  item: GroupItem;
  groupId: string;
  meId: string;
  isOwner: boolean;
  avatarOf: (userId: string) => string;
  /** True for the one post a share link opened, so the card can flash and settle. */
  highlight: boolean;
  /** On a wide screen, opens this post in the feed's overlay; absent on a phone, which stays inline. */
  onOpen?: () => void;
  onEdit: (item: GroupItem) => void;
  onDelete: (item: GroupItem) => void;
}) {
  const comments = useGroupComments(groupId, item.id);
  return <PostCard
    context="group"
    post={toPost(item)}
    // Share copies this post's own address inside the group, which is the deep link the
    // share button hands out and the one the link itself opens back onto.
    sharePath={`/messages/groups/${groupId}?tab=posts&post=${item.id}`}
    highlight={highlight}
    comments={<GroupComments groupId={groupId} postId={item.id} meId={meId} isOwner={isOwner} comments={comments} avatarOf={avatarOf} />}
    commentCount={comments.items.length}
    // A post is its author's to change, but a group's owner moderates the whole group.
    canManage={item.userId === meId || isOwner}
    avatarOf={avatarOf}
    onOpen={onOpen}
    menuItems={<>
      {item.userId === meId && <MenuItem onClick={() => onEdit(item)}><Pencil size={20} aria-hidden="true" />Edit</MenuItem>}
      <MenuItem danger onClick={() => onDelete(item)}><Trash2 size={20} aria-hidden="true" />Delete</MenuItem>
    </>}
  />;
}

/**
 * The Posts tab.
 *
 * Every post is the feed's card — one implementation of a post in the app rather than two that
 * drift apart — and on a wide screen clicking one opens the feed's overlay, so the post, its
 * actions and its thread are the same surfaces here as they are in the feed. The author's and
 * every commenter's avatar come from the member roster, so the same person is a photo here and in
 * the rail. Creating goes through the tab bar's one action (`onCreate`), and deleting is
 * optimistic: the row leaves at once and comes back if the write fails.
 */
export default function GroupPosts({ groupId, meId, isOwner, highlightId, onCreate, onEdit }: {
  groupId: string;
  meId: string;
  isOwner: boolean;
  /** The post a share link named, scrolled to and flashed once; null when the tab was opened plainly. */
  highlightId: number | null;
  onCreate: () => void;
  onEdit: (item: GroupItem) => void;
}) {
  // The overlay is the wide-screen behaviour only, exactly as it is in the feed: a phone keeps the
  // thread inline, and a share link still lands on the card itself.
  const wide = useMediaQuery('(min-width: 1024px)');
  const resource = usePagedList<GroupItem, GroupItem[]>({
    key: `/groups/${groupId}/content/posts?parentId=0`,
    pageQuery: page => `&offset=${(page - 1) * GROUP_PAGE_SIZE}`,
    pageSize: GROUP_PAGE_SIZE,
    normalize: raw => ({ items: raw }),
    keyOf: item => item.id,
  });
  // The author's avatar and every commenter's are resolved from the roster, which is loaded once.
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

  // The same modal every list opens: `?post=<id>` reopens it on a refresh, the arrows step through
  // the tab, and the group's own thread travels in as an element so the shared `PostView` draws it
  // where the feed's comments would be.
  const posts = useMemo(() => resource.items.map(toPost), [resource.items]);
  const { openFor, modal } = usePostModal(posts, postId => resource.update(items => items.filter(entry => entry.id !== postId)), post => {
    const item = resource.items.find(entry => entry.id === post.postId);
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

  // The card a share link named is scrolled to once the page it belongs to is actually on
  // screen: the effect waits for `settled`, because on the first render the list is still
  // loading and there is no card to look for.
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
      {/* The feed's own cadence: `--post-spacing` between one divider and the next post. */}
      <div className="space-y-[var(--post-spacing)]">
        {resource.items.map(item => <GroupPostRow key={item.id} item={item} groupId={groupId} meId={meId} isOwner={isOwner} avatarOf={avatarOf} highlight={item.id === highlightId} onOpen={wide ? openFor(toPost(item)) : undefined} onEdit={onEdit} onDelete={entry => void remove(entry)} />)}
      </div>
      <LoadMore loading={resource.loadingMore} hasMore={resource.hasMore} onLoadMore={resource.loadMore} endLabel={null} />
    </div>
    {modal}
  </div>;
}

