'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, MessageCircle, Share2, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Post, type Comment, dateLabel, errorMessage, request } from '../api/social';
import { useBackend } from './BackendProvider';
import { useResource } from '../lib/useResource';
import Avatar from './Avatar';
import RequestState from './RequestState';

function Comments({ post, onChange }: { post: Post; onChange: () => void }) {
  const { user } = useBackend();
  const [page, setPage] = useState(1);
  const comments = useResource<{ comments: Comment[]; lastPage: boolean }>(`/posts/comments?postId=${post.postId}&page=${page}&size=10&sortBy=createdat&sortOrder=desc`);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (editing) await request(`/posts/comments/${editing}`, 'PUT', { content: text });
      else await request('/posts/comments', 'POST', new URLSearchParams({ postId: String(post.postId), content: text }));
      setText(''); setEditing(null); comments.reload(); onChange();
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true); try { await action(); comments.reload(); onChange(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  async function react(comment: Comment, score: number) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: 'comment', entityId: comment.commentId, score });
      comments.update(data => ({ ...data, comments: data.comments.map(item => item.commentId === comment.commentId
        ? { ...item, score: result.totalScore, userScore: comment.userScore === score ? 0 : score } : item) }));
    } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="space-y-4 border-t border-slate-100 pt-4">
    <form onSubmit={submit} className="space-y-2"><label className="block text-sm font-medium" htmlFor={`comment-${post.postId}`}>{editing ? 'Edit comment' : 'Add a comment'}</label><textarea id={`comment-${post.postId}`} required minLength={3} maxLength={300} value={text} onChange={event => setText(event.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" /><div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{editing ? 'Save comment' : 'Comment'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setText(''); }}>Cancel</button>}</div></form>
    {comments.error && <RequestState error={comments.error} retry={comments.reload} />}
    {comments.data?.comments.map(comment => <div key={comment.commentId} className="rounded-lg bg-slate-50 p-3 space-y-2"><div className="flex justify-between gap-2"><Link href={`/profile/${comment.userId}`} className="text-sm font-semibold">@{comment.nickname || user.nickname}</Link><span className="text-xs text-slate-400">{dateLabel(comment.createdAt)}</span></div><p className="whitespace-pre-wrap break-words text-sm">{comment.commentText}</p><div className="flex items-center gap-3 text-xs text-slate-500">
      <button type="button" disabled={busy} aria-label="Upvote comment" aria-pressed={comment.userScore === 1} className={comment.userScore === 1 ? 'text-blue-600' : ''} onClick={() => void react(comment, 1)}><ArrowUp size={15} /></button><span>{comment.score}</span><button type="button" disabled={busy} aria-label="Downvote comment" aria-pressed={comment.userScore === -1} className={comment.userScore === -1 ? 'text-blue-600' : ''} onClick={() => void react(comment, -1)}><ArrowDown size={15} /></button>
      {comment.userId === user.userId && <><button aria-label="Edit comment" onClick={() => { setEditing(comment.commentId); setText(comment.commentText); }}><Pencil size={14} /></button><button disabled={busy} aria-label="Delete comment" onClick={() => void mutate(() => request(`/posts/comments?id=${comment.commentId}`, 'DELETE'))}><Trash2 size={14} /></button></>}
    </div></div>)}
    {comments.data?.comments.length === 0 && <p className="text-sm text-slate-500">Be the first to comment.</p>}
    <div className="flex justify-between text-sm"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="disabled:opacity-30">Previous comments</button><button disabled={!comments.data || comments.data.lastPage} onClick={() => setPage(page + 1)} className="disabled:opacity-30">More comments</button></div>
  </div>;
}
export default function PostCard({ post, fetchPosts }: { post: Post; fetchPosts: () => void }) {
  const { user } = useBackend();
  const [showComments, setShowComments] = useState(false);
  const [reaction, setReaction] = useState<{ score: number; userScore: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const vote = reaction || post;
  async function react(score: number) {
    setBusy(true);
    try { const result = await request<{ totalScore: number }>('/reactions', 'POST', { entityType: 'post', entityId: post.postId, score }); setReaction({ score: result.totalScore, userScore: vote.userScore === score ? 0 : score }); }
    catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); }
  }
  return <article className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
    <div className="flex items-center justify-between"><Link href={`/profile/${post.userId}`} className="flex items-center gap-3"><Avatar name={post.nickname} /><div><p className="font-semibold">@{post.nickname}</p><p className="text-xs text-slate-400">{dateLabel(post.createdAt)}</p></div></Link>{post.userId === user.userId && <div className="flex items-center gap-3"><Link href={`/post/${post.postId}/edit`} aria-label="Edit post" title="Edit post" className="text-slate-400 hover:text-blue-600"><Pencil size={18} /></Link><button disabled={busy} aria-label="Delete post" className="text-slate-400 hover:text-red-600" onClick={async () => { setBusy(true); try { await request(`/posts?id=${post.postId}`, 'DELETE'); fetchPosts(); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); } }}><Trash2 size={18} /></button></div>}</div>
    <Link href={`/post/${post.postId}`} className="block text-lg font-semibold">{post.title}</Link><p className="whitespace-pre-wrap break-words text-slate-700">{post.content}</p><span className="inline-block rounded-full bg-slate-100 px-2 py-1 text-xs capitalize text-slate-600">{post.privacy === 'selected' ? 'Selected followers' : post.privacy === 'followers' ? 'Followers only' : 'Public'}</span>
    {!!post.imageUrls?.length && <div className={`grid gap-2 ${post.imageUrls.length > 1 ? 'grid-cols-2' : ''}`}>{post.imageUrls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Post attachment" className="max-h-96 w-full rounded-lg object-cover" /></a>)}</div>}
    <div className="flex items-center gap-4 border-t border-slate-100 pt-3 text-sm text-slate-500"><button disabled={busy} aria-label="Upvote post" onClick={() => void react(1)} className={vote.userScore === 1 ? 'text-blue-600' : ''}><ArrowUp size={20} /></button><span>{vote.score}</span><button disabled={busy} aria-label="Downvote post" onClick={() => void react(-1)} className={vote.userScore === -1 ? 'text-blue-600' : ''}><ArrowDown size={20} /></button><button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1"><MessageCircle size={19} />{post.commentsCounter} comments</button><button aria-label="Share post" className="ml-auto" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/post/${post.postId}`); toast.success('Post link copied'); } catch { toast.error('Could not copy the link'); } }}><Share2 size={18} /></button></div>
    {showComments && <Comments post={post} onChange={fetchPosts} />}
  </article>;
}
