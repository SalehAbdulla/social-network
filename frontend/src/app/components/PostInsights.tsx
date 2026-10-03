'use client';

import { Eye, Heart, MessageCircle } from 'lucide-react';
import { type Post, type PostInsights as Insights } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from './BackendProvider';

/** Who the audience rule admits, in words. Mirrors the server's `postVisibility` clause. */
const AUDIENCE_LABEL: Record<Insights['reach']['audience'], string> = {
  everyone: 'everyone',
  followers: 'your followers',
  selected: 'the followers you chose',
};

/**
 * The author's own numbers for one post: how far it reaches, what it has drawn, and how the
 * reactions fall across the days they arrived.
 *
 * It is the author's in both directions. Nothing is offered to anyone else, and nothing is
 * requested for them either: the endpoint answers 403 to a reader who did not write the post,
 * so asking on their behalf would be a request whose answer is already known to be a refusal.
 * That is why `useResource` is given `enabled = isAuthor` rather than the panel being hidden
 * after a fetch that was bound to fail.
 */
export default function PostInsights({ post }: { post: Post }) {
  const { user } = useBackend();
  const isAuthor = post.userId === user.userId;
  const insights = useResource<Insights>(`/posts/${post.postId}/insights`, isAuthor);
  if (!isAuthor) return null;
  return <section aria-label="Post insights" className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
    <h2 className="text-sm font-semibold tracking-tight text-text">Insights</h2>
    {!insights.data && <p role="status" className="text-sm text-muted">{insights.error || 'Loading insights…'}</p>}
    {insights.data && <>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Eye size={16} aria-hidden="true" className="shrink-0 text-brand-1" />
        <span>Reach: <span className="font-medium text-text">{insights.data.reach.count}</span> {AUDIENCE_LABEL[insights.data.reach.audience]} can read this post.</span>
      </p>
      <p className="flex items-center gap-2 text-sm text-muted">
        <Heart size={16} aria-hidden="true" className="shrink-0 text-danger" />
        <span>Reactions: <span className="font-medium text-text">{insights.data.reactions}</span> ({insights.data.up} up, {insights.data.down} down)</span>
      </p>
      <p className="flex items-center gap-2 text-sm text-muted">
        <MessageCircle size={16} aria-hidden="true" className="shrink-0 text-brand-1" />
        <span>Comments: <span className="font-medium text-text">{insights.data.comments}</span></span>
      </p>
      {insights.data.days.length > 0 && <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs font-medium text-muted">Reactions over time</p>
        <ul className="space-y-1 text-xs text-muted">{insights.data.days.map(day => <li key={day.day} className="flex items-center justify-between gap-3">
          <time dateTime={day.day}>{day.day}</time>
          <span>{day.total} ({day.up} up, {day.down} down)</span>
        </li>)}</ul>
      </div>}
    </>}
  </section>;
}
