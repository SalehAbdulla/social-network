'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type Story, request } from '../../../api/social';
import { useResource } from '../../../lib/useResource';
import { groupStories, positionForUser } from '../../../lib/storySequence';
import StoryViewer from '../../../components/stories/StoryViewer';
import Loading from '../../../components/Loading';

/**
 * The story viewer's route — `/stories/{nickname}/{storyId}`.
 *
 * Opening a ring in the tray pushes this route, so the address bar names the story, the back
 * button closes the viewer, and a shared link opens straight onto it. The viewer is
 * self-contained: it reads the same live listing the tray does, groups it by author, and
 * starts at the linked story (or the author's first unseen one when the id is stale). A link
 * whose author is no longer live, or an empty listing, simply returns to the feed.
 */
export default function StoryRoute() {
  const params = useParams<{ nickname: string; storyId: string }>();
  const router = useRouter();
  const stories = useResource<Story[]>('/stories');

  const close = useCallback(() => {
    // Pushed from the tray, `back` returns to it; opened cold, there is nothing to go back to,
    // so the feed is the destination. `history.length` separates the two.
    if (window.history.length > 1) router.back();
    else router.replace('/');
  }, [router]);

  // Displaying a story is what records a view; the write is best-effort, the tray re-reads it.
  const seen = useCallback((story: Story) => {
    void request(`/stories/${story.storyId}/view`, 'POST').catch(() => {});
  }, []);

  // Advancing replaces the URL rather than pushing, so the address bar follows the story and
  // Back still leaves the viewer instead of stepping through it.
  const navigate = useCallback((story: Story) => {
    router.replace(`/stories/${story.nickname}/${story.storyId}`, { scroll: false });
  }, [router]);

  const groups = useMemo(() => groupStories(stories.data ?? []), [stories.data]);
  const nickname = decodeURIComponent(params.nickname ?? '').toLowerCase();
  const target = groups.find(group => group.stories[0]?.nickname.toLowerCase() === nickname);
  const start = target ? positionForUser(groups, target.userId, Number(params.storyId)) : null;

  useEffect(() => {
    if (!stories.loading && !start) router.replace('/');
  }, [stories.loading, start, router]);

  if (stories.loading) return <div className="story-boot"><Loading /></div>;
  if (!start) return null;
  return <StoryViewer groups={groups} start={start} onClose={close} onSeen={seen} onNavigate={navigate} />;
}
