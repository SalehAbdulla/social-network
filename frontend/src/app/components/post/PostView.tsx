'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  type Comment, type Post, dateLabel, displayName, errorMessage, isoTimestamp,
  relativeLabel, request, savePost, unsavePost, upload,
} from '../../api/social';
import { useBackend } from '../BackendProvider';
import { usePagedList } from '../../lib/usePagedList';
import { linkify } from '../../lib/linkify';
import Avatar from '../Avatar';
import Lightbox from '../Lightbox';
import PostActions from './PostActions';
import PostHeader from './PostHeader';
import PostMedia from './PostMedia';
import CommentList from './CommentList';
import CommentComposer from './CommentComposer';

const COMMENTS_PER_PAGE = 10;

/**
 * The Instagram post view: the media pane on the left and the panel on the right — header, the
 * scrollable caption-and-thread, the action bar, the likes line, the date and the composer. It is
 * the one implementation of a full post: `PostModal` opens it in a dialog and `/post/[postId]`
 * renders it inline, so the header, the media and the action row are the same everywhere.
 */
export default function PostView({ post, group = false, avatarOf, canManage, sharePath, thread, onEdit, onRemoved, onDelete, onNestedChange }: {
  post: Post;
  group?: boolean;
  /** The group roster's avatar for a user id, when the surface holds one. */
  avatarOf?: (userId: string) => string;
  canManage?: boolean;
  /** The path Share copies, when the post's own address is not `/post/{id}`. */
  sharePath?: string;
  /** A group's own thread, drawn in place of the feed's comment list and composer. */
  thread?: ReactNode;
  onEdit?: () => void;
  onRemoved?: (postId: string) => void;
  /** Overrides the built-in delete, for a post that is not in the `post` table (a group post). */
  onDelete?: () => void;
  /** Reports a nested dialog (a photo viewer or the post menu) so the modal stands its trap down. */
  onNestedChange?: (open: boolean) => void;
}) {
  const { user } = useBackend();
  const router = useRouter();
  const isOwner = group ? !!canManage : post.userId === user.userId;
  const hasMedia = !!post.imageUrls?.length;

  // A post row carries no avatar of its own, so the one photo the client can always resolve is the
  // reader's; everyone else keeps their initials until a row carries an avatar. A surface that
  // holds a roster (a group) hands its own lookup in through `avatarOf`.
  const resolveAvatar = useCallback(
    (userId: string) => avatarOf?.(userId) || (userId === user.userId ? user.avatar : ''),
    [avatarOf, user.userId, user.avatar],
  );

  const [reaction, setReaction] = useState<{ score: number; userScore: number } | null>(null);
  const [saved, setSaved] = useState(post.isSaved);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const caption = useRef<HTMLParagraphElement>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [photoViewer, setPhotoViewer] = useState<{ images: string[]; index: number } | null>(null);
  const [busyComment, setBusyComment] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [posting, setPosting] = useState(false);
  const composer = useRef<HTMLDivElement>(null);

  const vote = reaction ?? post;

  const list = usePagedList<Comment, { comments: Comment[]; lastPage: boolean }>({
    key: `/posts/comments?postId=${post.postId}&size=${COMMENTS_PER_PAGE}&sortBy=createdat&sortOrder=desc`,
    pageQuery: page => `&page=${page}`,
    pageSize: COMMENTS_PER_PAGE,
    normalize: raw => ({ items: raw.comments, hasMore: !raw.lastPage }),
    keyOf: comment => comment.commentId,
    enabled: !thread,
  });

  useEffect(() => {
    const node = caption.current;
    if (!node || expanded) return;
    setOverflowing(node.scrollHeight - node.clientHeight > 1);
  }, [post.content, expanded]);

  useEffect(() => { onNestedChange?.(viewer !== null || photoViewer !== null); }, [viewer, photoViewer, onNestedChange]);

  async function like() {
    if (busy) return;
    setBusy(true);
    const score = vote.userScore === 1 ? 0 : 1;
    const previous = { score: vote.score, userScore: vote.userScore };
    setReaction({ score: previous.score + (score - previous.userScore), userScore: score });
    try {
      const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: group ? 'group_post' : 'post', entityId: post.postId, score });
      setReaction({ score: result.totalScore, userScore: score });
    } catch (error) {
      setReaction(previous);
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }

  async function toggleSave() {
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await savePost(post.postId); else await unsavePost(post.postId);
    } catch (error) { setSaved(!next); toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  async function share() {
    const link = `${location.origin}${sharePath ?? `/post/${post.postId}`}`;
    try { await navigator.clipboard.writeText(link); toast.success('Post link copied'); }
    catch { toast.error('Could not copy the link'); }
  }

  async function remove() {
    if (onDelete) { onDelete(); return; }
    if (busy) return;
    setBusy(true);
    try { await request(`/posts?id=${post.postId}`, 'DELETE'); onRemoved?.(post.postId); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }

  function focusComposer() {
    composer.current?.querySelector('textarea')?.focus();
  }

  function addFiles(picked: File[]) {
    setFiles(current => [...current, ...picked.map(file => ({ file, url: URL.createObjectURL(file) }))].slice(0, 4));
  }

  async function submit() {
    const value = text.trim();
    if (posting || !value) return;
    setPosting(true);
    try {
      const imageUrls = (await Promise.all(files.map(item => upload(item.file)))).map(result => result.url);
      const created = await request<Comment>('/posts/comments', 'POST', { postId: post.postId, content: value, imageUrls });
      list.update(items => [created, ...items]);
      setText(''); setFiles([]);
    } catch (error) { toast.error(errorMessage(error)); } finally { setPosting(false); }
  }

  async function likeComment(comment: Comment) {
    if (busyComment !== null) return;
    setBusyComment(comment.commentId);
    const score = comment.userScore === 1 ? 0 : 1;
    const previous = { score: comment.score, userScore: comment.userScore };
    list.update(items => items.map(item => item.commentId === comment.commentId ? { ...item, score: item.score + (score - item.userScore), userScore: score } : item));
    try {
      const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: 'comment', entityId: comment.commentId, score });
      list.update(items => items.map(item => item.commentId === comment.commentId ? { ...item, score: result.totalScore, userScore: score } : item));
    } catch (error) {
      list.update(items => items.map(item => item.commentId === comment.commentId ? { ...item, ...previous } : item));
      toast.error(errorMessage(error));
    } finally { setBusyComment(null); }
  }

  async function deleteComment(comment: Comment) {
    const previous = list.items;
    list.update(items => items.filter(item => item.commentId !== comment.commentId));
    try { await request(`/posts/comments/${comment.commentId}`, 'DELETE'); }
    catch (error) { list.update(() => previous); toast.error(errorMessage(error)); }
  }

  return <div className="pv-dialog" data-anim="true" data-ratio={ratio === null ? undefined : 'true'} style={ratio === null ? undefined : ({ '--pv-ratio': String(ratio) } as CSSProperties)}>
    {hasMedia
      ? <PostMedia post={post} onOpen={setViewer} onRatio={setRatio} />
      : <div className="pv-media"><div className="pv-text-tile"><p dir="auto">{linkify(post.content)}</p></div></div>}
    <div className="pv-panel">
      <PostHeader post={post} group={group} isOwner={isOwner} avatarUrl={resolveAvatar(post.userId)} onEdit={onEdit}
        onDelete={() => void remove()} onCopyLink={() => void share()}
        onGoToPost={group ? undefined : () => router.push(`/post/${post.postId}`)} onShare={() => void share()} />
      <div className="pv-scroll">
        <div className="pv-row">
          <Avatar name={displayName(post)} avatarUrl={resolveAvatar(post.userId)} size={32} />
          <div className="min-w-0 flex-1">
            <p ref={caption} className="pv-body" data-clamped={!expanded} dir="auto"><span className="pv-name">{displayName(post)}</span>{' '}{linkify(post.content)}</p>
            {overflowing && <button type="button" className="pv-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'less' : 'more'}</button>}
            <p className="pv-line"><time dateTime={isoTimestamp(post.createdAt)} title={dateLabel(post.createdAt)}>{relativeLabel(post.createdAt)}</time></p>
          </div>
        </div>
        {thread ?? <CommentList items={list.items} loading={list.loading} error={list.error} settled={list.settled} hasMore={list.hasMore} loadingMore={list.loadingMore} meId={user.userId} isOwner={isOwner} avatarOf={resolveAvatar} busyId={busyComment} onLike={comment => void likeComment(comment)} onDelete={comment => void deleteComment(comment)} onRetry={list.reload} onLoadMore={list.loadMore} onOpenPhoto={(images, index) => setPhotoViewer({ images, index })} />}
      </div>
      <PostActions liked={vote.userScore === 1} saved={saved} showSave={!group} busy={busy} onLike={() => void like()} onComment={focusComposer} onShare={() => void share()} onSave={() => void toggleSave()} />
      <p className={vote.score > 0 ? 'pv-likes' : 'pv-likes pv-likes-zero'}>{vote.score > 0 ? `${vote.score} ${vote.score === 1 ? 'like' : 'likes'}` : 'Be the first to like this'}</p>
      <p className="pv-date"><time dateTime={isoTimestamp(post.createdAt)} title={dateLabel(post.createdAt)}>{relativeLabel(post.createdAt)}</time></p>
      {!thread && <div ref={composer}>
        {files.length > 0 && <div className="pv-previews">
          {files.map(item => <span key={item.url} className="pv-thumb"><img src={item.url} alt={item.file.name} />
            <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => setFiles(current => current.filter(entry => entry.url !== item.url))}>×</button>
          </span>)}
        </div>}
        <CommentComposer postId={post.postId} value={text} onChange={setText} onSubmit={() => void submit()} busy={posting} canAddPhoto onPickFiles={addFiles} />
      </div>}
    </div>
    {viewer !== null && <Lightbox images={post.imageUrls} startIndex={viewer} label="Post photos" onClose={() => setViewer(null)} />}
    {photoViewer && <Lightbox images={photoViewer.images} startIndex={photoViewer.index} label="Comment photos" onClose={() => setPhotoViewer(null)} />}
  </div>;
}

