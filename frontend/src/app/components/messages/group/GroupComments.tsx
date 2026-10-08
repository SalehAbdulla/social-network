'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { errorMessage, isoTimestamp, relativeLabel, request } from '../../../api/social';
import { linkify } from '../../../lib/linkify';
import { useBackend } from '../../BackendProvider';
import Avatar from '../../Avatar';
import Button from '../../ui/Button';
import Menu, { MenuItem } from '../../ui/Menu';
import { itemName, type GroupItem } from './groupContent';
import { groupExactTime } from './groupTime';

export function useGroupComments(groupId: string, postId: number) {
  const [items, setItems] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;
    request<GroupItem[]>(`/groups/${groupId}/content/comments?parentId=${postId}&offset=0`, 'GET', undefined, abort.signal)
      .then(page => { if (!cancelled) { setItems(page); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; abort.abort(); };
  }, [groupId, postId, revision]);
  return { items, loading, setItems, reload: () => setRevision(value => value + 1) };
}

export default function GroupComments({ groupId, postId, meId, isOwner, comments, avatarOf, variant = 'inline' }: {
  groupId: string;
  postId: number;
  meId: string;
  isOwner: boolean;
  comments: ReturnType<typeof useGroupComments>;
  avatarOf?: (userId: string) => string;
  variant?: 'inline' | 'panel';
}) {
  const { user } = useBackend();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const total = comments.items.length;

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (busy || !value) return;
    setBusy(true);
    const tempId = -Date.now();
    const optimistic: GroupItem = {
      id: tempId,
      userId: meId,
      firstName: user.firstName,
      lastName: user.lastName,
      nickname: user.nickname,
      kind: 'comments',
      parentId: postId,
      title: '',
      content: value,
      mediaUrl: '',
      startsAt: '',
      createdAt: new Date().toISOString(),
      rsvp: '',
      going: 0,
      notGoing: 0,
      upcoming: false,
      likeCount: 0,
      likedByMe: false,
    };
    comments.setItems(items => [...items, optimistic]);
    setText('');
    try {
      await request(`/groups/${groupId}/content/comments?parentId=${postId}`, 'POST', { content: value });
      comments.reload();
    } catch (error) {
      comments.setItems(items => items.filter(comment => comment.id !== tempId));
      setText(value);
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function remove(commentId: number) {
    const previous = comments.items;
    comments.setItems(items => items.filter(comment => comment.id !== commentId));
    try { await request(`/groups/${groupId}/content/comments/${commentId}?parentId=${postId}`, 'DELETE'); }
    catch (error) {
      comments.setItems(() => previous);
      toast.error(errorMessage(error));
    }
  }

  const label = total === 1 ? 'View 1 comment' : `View all ${total} comments`;

  const renderComment = (comment: GroupItem) => {
    const mine = comment.userId === meId;
    const name = mine ? 'You' : itemName(comment);
    return <div key={comment.id} className="grp-comment">
      <Avatar name={name} avatarUrl={avatarOf?.(comment.userId) ?? ''} size={28} />
      <div className="min-w-0 flex-1">
        <div className="grp-comment-body">
          <span className="grp-comment-name shrink-0" dir="auto">{name}</span>
          <span className="grp-comment-text" dir="auto">{linkify(comment.content)}</span>
        </div>
        <time className="grp-comment-time" dateTime={isoTimestamp(comment.createdAt)} title={groupExactTime(comment.createdAt)}>{relativeLabel(comment.createdAt)}</time>
      </div>
      {(comment.userId === meId || isOwner) && <Menu label="Comment actions" className="grp-comment-menu">
        <MenuItem tone="danger" onClick={() => void remove(comment.id)}>Delete</MenuItem>
      </Menu>}
    </div>;
  };

  const form = <form className="grp-comment-form" onSubmit={add}>
    <label className="grp-comment-field">
      <span className="sr-only">Add a comment</span>
      <input value={text} onChange={event => setText(event.target.value)} placeholder="Add a comment..." maxLength={1000} dir="auto" />
    </label>
    {!!text.trim() && <Button type="submit" variant="text" loading={busy}>Post</Button>}
  </form>;

  if (variant === 'panel') return <div className="flex min-h-0 flex-1 flex-col">
    <div className="order-2 shrink-0 border-t border-border p-4">{form}</div>
    <div className="order-1 min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {!comments.loading && total === 0 && <p className="text-sm text-slate-500">Be the first to comment.</p>}
      {comments.items.map(renderComment)}
    </div>
  </div>;

  return <div className="grp-comments">
    {!expanded && total > 0 && <button type="button" className="grp-comment-toggle" onClick={() => setExpanded(true)}>{label}</button>}
    {expanded && comments.items.map(renderComment)}
    {expanded && total > 0 && <button type="button" className="grp-comment-toggle" onClick={() => setExpanded(false)}>Hide comments</button>}
    {form}
  </div>;
}

export function GroupThread({ groupId, postId, meId, isOwner, avatarOf }: {
  groupId: string;
  postId: number;
  meId: string;
  isOwner: boolean;
  avatarOf?: (userId: string) => string;
}) {
  const comments = useGroupComments(groupId, postId);
  return <GroupComments groupId={groupId} postId={postId} meId={meId} isOwner={isOwner} comments={comments} avatarOf={avatarOf} variant="panel" />;
}
