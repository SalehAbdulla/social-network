'use client';

import { Eye, Heart, MessageCircle } from 'lucide-react';
import { type Post, type PostInsights as Insights } from '../api/social';
import { useResource } from '../lib/useResource';
import { useBackend } from './BackendProvider';

const AUDIENCE_LABEL: Record<Insights['reach']['audience'], string> = {
  everyone: 'everyone',
  followers: 'your followers',
  selected: 'the followers you chose',
};

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
