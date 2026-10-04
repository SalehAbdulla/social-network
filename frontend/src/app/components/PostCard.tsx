'use client';

import { linkify } from '../lib/linkify';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Bookmark, Heart, MessageCircle, Share2, Trash2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Post, type Comment, PRIVACY_LABEL, dateLabel, errorMessage, isoTimestamp, relativeLabel, request, savePost, unsavePost, upload } from '../api/social';
import { useBackend } from './BackendProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useDialogFocus } from '../lib/useDialogFocus';
import { usePagedList } from '../lib/usePagedList';
import { useInView } from '../lib/useInView';
import { mediaImageProps } from '../lib/mediaVariants';
import Avatar from './Avatar';
import ImagePicker from './ImagePicker';
import Lightbox from './Lightbox';
import LoadMore from './LoadMore';
import Loading from './Loading';

const COMMENTS_PER_PAGE = 10;
// A second tap on a photo inside this window reads as a double-tap (like) rather
// than a second attempt to open the lightbox.
const DOUBLE_TAP_MS = 300;

function Comments({ post, onCountChange }: { post: Post; onCountChange: (delta: number) => void }) {
  const { user } = useBackend();
  // A wide screen shows these open, but the feed holds ten posts, so reading every
  // thread on mount would fire ten requests before the reader had looked at one. The
  // first page is asked for only once the section is about to be seen; `forced` covers
  // the one path the observer cannot — a submit that arrives while the section is still
  // off screen (a programmatic fill, a keyboard jump), which must not lose the comment.
  const [sectionRef, sectionSeen] = useInView<HTMLDivElement>();
  const [forced, setForced] = useState(false);
  const ready = sectionSeen || forced;
  const comments = usePagedList<Comment, { comments: Comment[]; lastPage: boolean }>({
    key: `/posts/comments?postId=${post.postId}&size=${COMMENTS_PER_PAGE}&sortBy=createdat&sortOrder=desc`,
    pageQuery: page => `&page=${page}`,
    pageSize: COMMENTS_PER_PAGE,
    normalize: raw => ({ items: raw.comments, hasMore: !raw.lastPage }),
    keyOf: comment => comment.commentId,
    enabled: ready,
  });

  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Which comment photo is open in the viewer, if any. The set travels with the
  // index because each comment owns its own photos.
  const [viewer, setViewer] = useState<{ images: string[]; index: number } | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (editing) {
        const id = editing;
        await request(`/posts/comments/${id}`, 'PUT', { content: text });
        comments.update(items => items.map(item => item.commentId === id ? { ...item, commentText: text } : item));
      } else {
        // The composer holds files; only the uploaded URLs travel with the comment. The
        // uploads run together and in the picker's order — `Promise.all` keeps that order
        // however the responses interleave — instead of one after another, so a
        // four-photo comment no longer waits on four round trips before it is sent.
        const imageUrls = (await Promise.all(images.map(file => upload(file)))).map(result => result.url);
        const created = await request<Comment>('/posts/comments', 'POST', { postId: post.postId, content: text, imageUrls });
        onCountChange(1);
        // Newest-first ordering, so the row the server returned belongs at the top.
        // Splicing it in is what keeps the reader's place; re-reading page one would be a
        // second round trip and would throw away the pages already scrolled through. If
        // the thread has not been read yet, switching it on fetches it instead, and page
        // one carries this very comment.
        if (ready) comments.update(items => [created, ...items]);
        else setForced(true);
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
  return <div ref={sectionRef} className="space-y-4 border-t border-slate-100 pt-4">
    <form onSubmit={submit} className="space-y-2"><label className="block text-sm font-medium" htmlFor={`comment-${post.postId}`}>{editing ? 'Edit comment' : 'Add a comment'}</label><textarea id={`comment-${post.postId}`} required minLength={3} maxLength={300} value={text} onChange={event => setText(event.target.value)} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />
      {!editing && <ImagePicker files={images} onChange={setImages} max={4} disabled={busy} />}
      <div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{editing ? 'Save comment' : 'Comment'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setText(''); }}>Cancel</button>}</div></form>
    {comments.loading && <Loading height={56} label="Loading comments" />}
    {comments.items.map(comment => <div key={comment.commentId} className="rounded-xl bg-slate-50 p-3 space-y-2"><div className="flex justify-between gap-2"><Link href={`/profile/${comment.userId}`} className="text-sm font-semibold">@{comment.nickname || user.nickname}</Link><time className="text-xs text-slate-400" dateTime={isoTimestamp(comment.createdAt)} title={dateLabel(comment.createdAt)}>{relativeLabel(comment.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{linkify(comment.commentText)}</p>{!!comment.imageUrls?.length && <div className={`grid gap-2 ${comment.imageUrls.length > 1 ? 'grid-cols-2' : ''}`}>{comment.imageUrls.map((url, position) => <button key={url} type="button" aria-label={`Open comment image ${position + 1} of ${comment.imageUrls.length}`} onClick={() => setViewer({ images: comment.imageUrls, index: position })} className="block w-full cursor-zoom-in"><img {...mediaImageProps(url, comment.imageUrls.length > 1 ? '(max-width: 640px) 50vw, 320px' : '(max-width: 768px) 100vw, 480px')} alt="Comment attachment" className="aspect-square max-h-72 w-full rounded-lg bg-white object-contain" /></button>)}</div>}<div className="flex items-center gap-3 text-xs text-slate-500">
      <button type="button" disabled={busy} aria-label="Upvote comment" aria-pressed={comment.userScore === 1} className={comment.userScore === 1 ? 'text-blue-600' : ''} onClick={() => void react(comment, 1)}><ArrowUp size={15} /></button><span>{comment.score}</span><button type="button" disabled={busy} aria-label="Downvote comment" aria-pressed={comment.userScore === -1} className={comment.userScore === -1 ? 'text-blue-600' : ''} onClick={() => void react(comment, -1)}><ArrowDown size={15} /></button>
      {comment.userId === user.userId && <><button aria-label="Edit comment" onClick={() => { setEditing(comment.commentId); setText(comment.commentText); }}><Pencil size={14} /></button><button disabled={busy} aria-label="Delete comment" onClick={() => void mutate(() => request(`/posts/comments?id=${comment.commentId}`, 'DELETE'), () => { comments.update(items => items.filter(item => item.commentId !== comment.commentId)); onCountChange(-1); })}><Trash2 size={14} /></button></>}
    </div></div>)}
    {comments.settled && comments.items.length === 0 && <p className="text-sm text-slate-500">Be the first to comment.</p>}
    <LoadMore loading={comments.loadingMore} hasMore={comments.hasMore} onLoadMore={comments.loadMore} label="Load more comments" endLabel={null} className="py-2" />
    {viewer && <Lightbox images={viewer.images} startIndex={viewer.index} label="Comment photos" onClose={() => setViewer(null)} />}
  </div>;
}

/**
 * The comment area as a phone sees it: a bottom drawer, so opening a thread does not push
 * the post it belongs to off the screen. It holds the same `Comments` and only changes
 * where they sit, so nothing about reading, writing or voting on a comment differs
 * between the two.
 *
 * The dialog contract — focus moves in, Tab cycles inside, Escape closes, the page behind
 * is frozen — is `useDialogFocus`, the same hook the story viewer and the navigation
 * drawer use. The backdrop is a sibling of the panel rather than its parent: `backdrop-
 * filter` makes an element the containing block for `position: fixed` descendants, so a
 * backdrop wrapping the panel would anchor the sheet to the backdrop instead of the
 * viewport. `lg:hidden` is a safety net for the one frame between a resize and the media
 * query being read, when this branch is still the one rendering.
 */
function CommentSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const sheet = useDialogFocus<HTMLDivElement>(onClose);
  return <>
    <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" />
    <div ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Comments" className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 shadow-2xl lg:hidden">
      <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border" />
      <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold text-text">Comments</h2><button type="button" aria-label="Close comments" onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2"><X size={18} /></button></div>
      {children}
    </div>
  </>;
}
export default function PostCard({ post, fetchPosts, onPostRemoved, onUnsaved }: {
  post: Post;
  /** Refetch fallback for surfaces that are not list-backed, such as the single post page. */
  fetchPosts?: () => void;
  /** Preferred: drop the deleted row in place so a long list does not jump. */
  onPostRemoved?: (postId: number) => void;
  /** Called when this card un-saves a post, so the saved list can drop the row. */
  onUnsaved?: (postId: number) => void;
}) {
  const { user } = useBackend();
  // A wide screen keeps the comment list inline and open, as it always was; a phone gets
  // it as a bottom drawer that stays shut until the reader asks for it. `null` is "follow
  // the viewport", decided here at render rather than by an effect that would overrule a
  // reader who has already opened or closed the list — once they have, their choice wins.
  const wide = useMediaQuery('(min-width: 1024px)');
  const [commentsOpen, setCommentsOpen] = useState<boolean | null>(null);
  const showComments = commentsOpen ?? wide;
  const [reaction, setReaction] = useState<{ score: number; userScore: number } | null>(null);
  // Comments mutate their own list, so the counter tracks the server value plus
  // the deltas this card saw instead of forcing a feed-wide refetch.
  const [commentDelta, setCommentDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  // The bookmark flag is viewer-relative and comes from the server with the post,
  // so the button starts in the right state and only changes once this card asks.
  const [saved, setSaved] = useState(post.isSaved);
  // Which post photo is open in the viewer, if any.
  const [viewer, setViewer] = useState<number | null>(null);
  // A double-tap like: the burst id plus the photo it should appear over, so the
  // heart lands on the picture the reader tapped rather than the middle of the grid.
  const [burst, setBurst] = useState<{ id: number; position: number } | null>(null);
  // Remembers the last tap on a photo so a second tap inside the window reads as a
  // double-tap (like) instead of arming the lightbox a second time.
  const lastTap = useRef<{ position: number; at: number; timer: ReturnType<typeof setTimeout> | null }>({ position: -1, at: 0, timer: null });
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
  // A double-tap on a photo likes it. A single tap still opens the lightbox, so the
  // two gestures share one click handler and a short window: the first tap arms the
  // lightbox, and a second tap inside the window cancels it and likes instead.
  function handleMediaTap(position: number, timeStamp: number) {
    const previous = lastTap.current;
    if (previous.position === position && timeStamp - previous.at <= DOUBLE_TAP_MS) {
      if (previous.timer) clearTimeout(previous.timer);
      lastTap.current = { position: -1, at: 0, timer: null };
      if (!busy && vote.userScore !== 1) {
        setBurst({ id: timeStamp, position });
        void react(1);
      }
      return;
    }
    if (previous.timer) clearTimeout(previous.timer);
    lastTap.current = { position, at: timeStamp, timer: setTimeout(() => setViewer(position), DOUBLE_TAP_MS) };
  }
  // Named rather than inline so the two branches of the comment render share one pair of
  // callbacks: the counter moves the same way and closing is the same act whether the
  // comments are inline or in the drawer.
  function bumpComments(delta: number) {
    setCommentDelta(value => value + delta);
  }
  function closeComments() {
    setCommentsOpen(false);
  }
  async function toggleSave() {
    if (busy) return;
    setBusy(true);
    // Optimistic like the vote arrows: the icon fills now and goes back, with a
    // message, if the write fails. The server is idempotent, so a double click is
    // a state rather than a conflict.
    const next = !saved;
    setSaved(next);
    try {
      if (next) await savePost(post.postId); else { await unsavePost(post.postId); onUnsaved?.(post.postId); }
      toast.success(next ? 'Post saved' : 'Removed from saved');
    } catch (error) {
      setSaved(!next);
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
  return <article className="space-y-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
    <div className="flex items-center justify-between"><Link href={`/profile/${post.userId}`} className="flex items-center gap-3"><Avatar name={post.nickname} /><div><p className="font-semibold">@{post.nickname}</p><p className="text-xs text-slate-400"><time dateTime={isoTimestamp(post.createdAt)} title={dateLabel(post.createdAt)}>{relativeLabel(post.createdAt)}</time></p></div></Link>{post.userId === user.userId && <div className="flex items-center gap-1"><Link href={`/post/${post.postId}/edit`} aria-label="Edit post" title="Edit post" className="flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-blue-600"><Pencil size={18} /></Link><button disabled={busy} aria-label="Delete post" title="Delete post" className="flex size-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600" onClick={() => void remove()}><Trash2 size={18} /></button></div>}</div>
    {post.title && <Link href={`/post/${post.postId}`} className="block text-lg font-semibold hover:text-blue-700">{post.title}</Link>}<p className="whitespace-pre-wrap break-words text-slate-700">{linkify(post.content)}</p><span className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{PRIVACY_LABEL[post.privacy]}</span>
    {!!post.imageUrls?.length && <div className={`-mx-5 grid gap-2 ${post.imageUrls.length > 1 ? 'grid-cols-2' : ''}`}>{post.imageUrls.map((url, position) => <button key={url} type="button" aria-label={`Open image ${position + 1} of ${post.imageUrls.length}`} onClick={(event) => handleMediaTap(position, event.timeStamp)} className="relative block w-full cursor-zoom-in touch-manipulation"><img {...mediaImageProps(url, post.imageUrls.length > 1 ? '(max-width: 640px) 50vw, 320px' : '(max-width: 768px) 100vw, 640px')} alt="Post attachment" className="aspect-square w-full bg-card-2 object-cover" />{burst?.position === position && <span key={burst.id} aria-hidden="true" onAnimationEnd={() => setBurst(null)} className="heart-burst text-red-500"><Heart size={80} fill="currentColor" strokeWidth={0} /></span>}</button>)}</div>}
    <div className="flex items-center gap-1 border-t border-border pt-3 text-muted"><button disabled={busy} aria-label={vote.userScore === 1 ? 'Unlike post' : 'Like post'} aria-pressed={vote.userScore === 1} onClick={() => void react(1)} className={`flex items-center gap-1.5 rounded-full p-2 transition hover:bg-surface-2 ${vote.userScore === 1 ? 'text-danger' : ''}`}><Heart size={22} fill={vote.userScore === 1 ? 'currentColor' : 'none'} /><span className="text-sm font-medium">{vote.score}</span></button><button aria-expanded={showComments} aria-label={showComments ? 'Hide comments' : 'Show comments'} onClick={() => setCommentsOpen(!showComments)} className="flex items-center gap-1.5 rounded-full p-2 transition hover:bg-surface-2"><MessageCircle size={22} /><span className="text-sm font-medium">{commentCount}</span></button><button aria-label="Share post" className="rounded-full p-2 transition hover:bg-surface-2" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}/post/${post.postId}`); toast.success('Post link copied'); } catch { toast.error('Could not copy the link'); } }}><Share2 size={22} /></button><button disabled={busy} aria-label={saved ? 'Remove from saved' : 'Save post'} aria-pressed={saved} title={saved ? 'Remove from saved' : 'Save post'} onClick={() => void toggleSave()} className={`ml-auto rounded-full p-2 transition hover:bg-surface-2 ${saved ? 'text-brand-1' : ''}`}><Bookmark size={22} fill={saved ? 'currentColor' : 'none'} /></button></div>
    {showComments && (wide
      ? <Comments post={post} onCountChange={bumpComments} />
      : <CommentSheet onClose={closeComments}><Comments post={post} onCountChange={bumpComments} /></CommentSheet>)}
    {viewer !== null && <Lightbox images={post.imageUrls} startIndex={viewer} label="Post photos" onClose={() => setViewer(null)} />}
  </article>;
}
