'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, MessageCircle, Share2, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Post, type Comment, dateLabel, errorMessage, isoTimestamp, relativeLabel, request, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import { usePagedList } from '../lib/usePagedList';
import Avatar from './Avatar';
import ImagePicker from './ImagePicker';
import LoadMore from './LoadMore';
import Loading from './Loading';

const COMMENTS_PER_PAGE = 10;

const PRIVACY_LABEL: Record<Post['privacy'], string> = {
  public: 'Public',
  followers: 'Followers only',
  selected: 'Selected followers',
};

function Comments({ post, onCountChange }: { post: Post; onCountChange: (delta: number) => void }) {
  const { user } = useBackend();
  const comments = usePagedList<Comment, { comments: Comment[]; lastPage: boolean }>({
    key: `/posts/comments?postId=${post.postId}&size=${COMMENTS_PER_PAGE}&sortBy=createdat&sortOrder=desc`,
    pageQuery: page => `&page=${page}`,
    pageSize: COMMENTS_PER_PAGE,
    normalize: raw => ({ items: raw.comments, hasMore: !raw.lastPage }),
    keyOf: comment => comment.commentId,
  });

  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (editing) {
        const id = editing;
        await request(`/posts/comments/${id}`, 'PUT', { content: text });
        comments.update(items => items.map(item => item.commentId === id ? { ...item, commentText: text } : item));
      } else {
        // The composer holds files; only the uploaded URLs travel with the comment.
        const imageUrls: string[] = [];
        for (const file of images) imageUrls.push((await upload(file)).url);
        await request('/posts/comments', 'POST', { postId: post.postId, content: text, imageUrls });
        // Newest-first ordering, so a new comment belongs on the first page.
        comments.reload();
        onCountChange(1);
      }
      setText(''); setEditing(null); setImages([]);
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  // Comment mutations patch the loaded rows instead of re-reading a page, which
  // keeps the reader's place in a long thread.
  async function mutate(action: () => Promise<unknown>, onDone: () => void) {
    setBusy(true); try { await action(); onDone(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  async function react(comment: Comment, score: number) {
    if (busy) return;
    setBusy(true);
    // Optimistic: the arrows move now and the server's total replaces the guess
    // when it answers, so a click is not a round trip of nothing happening. A
    // failure puts the previous numbers back and says why.
    const previous = { score: comment.score, userScore: comment.userScore };
    const userScore = comment.userScore === score ? 0 : score;
    comments.update(items => items.map(item => item.commentId === comment.commentId
      ? { ...item, score: item.score + (userScore - item.userScore), userScore } : item));
    try {
      const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: 'comment', entityId: comment.commentId, score });
      comments.update(items => items.map(item => item.commentId === comment.commentId
        ? { ...item, score: result.totalScore, userScore } : item));
    } catch (error) {
      comments.update(items => items.map(item => item.commentId === comment.commentId
        ? { ...item, ...previous } : item));
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }
  return <div className="space-y-4 border-t border-slate-100 pt-4">
    <form onSubmit={submit} className="space-y-2"><label className="block text-sm font-medium" htmlFor={`comment-${post.postId}`}>{editing ? 'Edit comment' : 'Add a comment'}</label><textarea id={`comment-${post.postId}`} required minLength={3} maxLength={300} value={text} onChange={event => setText(event.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
      {!editing && <ImagePicker files={images} onChange={setImages} max={4} disabled={busy} />}
      <div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{editing ? 'Save comment' : 'Comment'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setText(''); }}>Cancel</button>}</div></form>
    {comments.loading && <Loading height={56} label="Loading comments" />}
    {comments.items.map(comment => <div key={comment.commentId} className="rounded-xl bg-slate-50 p-3 space-y-2"><div className="flex justify-between gap-2"><Link href={`/profile/${comment.userId}`} className="text-sm font-semibold">@{comment.nickname || user.nickname}</Link><time className="text-xs text-slate-400" dateTime={isoTimestamp(comment.createdAt)} title={dateLabel(comment.createdAt)}>{relativeLabel(comment.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{comment.commentText}</p>{!!comment.imageUrls?.length && <div className={`grid gap-2 ${comment.imageUrls.length > 1 ? 'grid-cols-2' : ''}`}>{comment.imageUrls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Comment attachment" className="aspect-square max-h-72 w-full rounded-lg bg-white object-contain" /></a>)}</div>}<div className="flex items-center gap-3 text-xs text-slate-500">
      <button type="button" disabled={busy} aria-label="Upvote comment" aria-pressed={comment.userScore === 1} className={comment.userScore === 1 ? 'text-blue-600' : ''} onClick={() => void react(comment, 1)}><ArrowUp size={15} /></button><span>{comment.score}</span><button type="button" disabled={busy} aria-label="Downvote comment" aria-pressed={comment.userScore === -1} className={comment.userScore === -1 ? 'text-blue-600' : ''} onClick={() => void react(comment, -1)}><ArrowDown size={15} /></button>
      {comment.userId === user.userId && <><button aria-label="Edit comment" onClick={() => { setEditing(comment.commentId); setText(comment.commentText); }}><Pencil size={14} /></button><button disabled={busy} aria-label="Delete comment" onClick={() => void mutate(() => request(`/posts/comments?id=${comment.commentId}`, 'DELETE'), () => { comments.update(items => items.filter(item => item.commentId !== comment.commentId)); onCountChange(-1); })}><Trash2 size={14} /></button></>}
    </div></div>)}
    {comments.settled && comments.items.length === 0 && <p className="text-sm text-slate-500">Be the first to comment.</p>}
    <LoadMore loading={comments.loadingMore} hasMore={comments.hasMore} onLoadMore={comments.loadMore} label="Load more comments" endLabel={null} className="py-2" />
  </div>;
}
export default function PostCard({ post, fetchPosts, onPostRemoved }: {
  post: Post;
  /** Refetch fallback for surfaces that are not list-backed, such as the single post page. */
  fetchPosts?: () => void;
  /** Preferred: drop the deleted row in place so a long list does not jump. */
  onPostRemoved?: (postId: number) => void;
}) {
  const { user } = useBackend();
  const [showComments, setShowComments] = useState(true);
  const [reaction, setReaction] = useState<{ score: number; userScore: number } | null>(null);
  // Comments mutate their own list, so the counter tracks the server value plus
  // the deltas this card saw instead of forcing a feed-wide refetch.
  const [commentDelta, setCommentDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const vote = reaction || post;
  const commentCount = Math.max(0, post.commentsCounter + commentDelta);
  async function react(score: number) {
    if (busy) return;
    setBusy(true);
    // Optimistic like the comment arrows: the vote moves now, the server's total
    // replaces the estimate when it answers, and a failure puts it back.
    const previous = { score: vote.score, userScore: vote.userScore };
    const userScore = vote.userScore === score ? 0 : score;
    setReaction({ score: vote.score + (userScore - vote.userScore), userScore });
    try {
      const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: 'post', entityId: post.postId, score });
      setReaction({ score: result.totalScore, userScore });
    } catch (error) {
      setReaction(previous);
      toast.error(errorMessage(error));
    } finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await request(`/posts?id=${post.postId}`, 'DELETE');
      if (onPostRemoved) onPostRemoved(post.postId); else fetchPosts?.();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
    <div className="flex items-center justify-between"><Link href={`/profile/${post.userId}`} className="flex items-center gap-3"><Avatar name={post.nickname} /><div><p className="font-semibold">@{post.nickname}</p><p className="text-xs text-slate-400"><time dateTime={isoTimestamp(post.createdAt)} title={dateLabel(post.createdAt)}>{relativeLabel(post.createdAt)}</time></p></div></Link>{post.userId === user.userId && <div className="flex items-center gap-1"><Link href={`/post/${post.postId}/edit`} aria-label="Edit post" title="Edit post" className="flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-blue-600"><Pencil size={18} /></Link><button disabled={busy} aria-label="Delete post" title="Delete post" className="flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600" onClick={() => void remove()}><Trash2 size={18} /></button></div>}</div>
    {post.title && <Link href={`/post/${post.postId}`} className="block text-lg font-semibold hover:text-blue-700">{post.title}</Link>}<p className="whitespace-pre-wrap break-words text-slate-700">{post.content}</p><span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{PRIVACY_LABEL[post.privacy]}</span>
    {!!post.imageUrls?.length && <div className={`grid gap-2 ${post.imageUrls.length > 1 ? 'grid-cols-2' : ''}`}>{post.imageUrls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Post attachment" className="aspect-square max-h-[540px] w-full rounded-xl bg-slate-50 object-contain" /></a>)}</div>}
    <div className="flex items-center gap-4 border-t border-border pt-3 text-sm text-slate-500"><button disabled={busy} aria-label="Upvote post" onClick={() => void react(1)} className={`flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-slate-100 ${vote.userScore === 1 ? 'text-blue-600' : ''}`}><ArrowUp size={20} />{vote.score}</button><button disabled={busy} aria-label="Downvote post" onClick={() => void react(-1)} className={`flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-slate-100 ${vote.userScore === -1 ? 'text-blue-600' : ''}`}><ArrowDown size={20} /></button><button aria-expanded={showComments} onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5 rounded-full px-2 py-1 transition hover:bg-slate-100"><MessageCircle size={19} />{commentCount} comments</button><button aria-label="Share post" className="ml-auto flex size-9 items-center justify-center rounded-full transition hover:bg-slate-100" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/post/${post.postId}`); toast.success('Post link copied'); } catch { toast.error('Could not copy the link'); } }}><Share2 size={18} /></button></div>
    {showComments && <Comments post={post} onCountChange={delta => setCommentDelta(value => value + delta)} />}
  </article>;
}
