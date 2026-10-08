'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { type Story, request } from '../../../api/social';
import { useResource } from '../../../lib/useResource';
import { groupStories, positionForUser } from '../../../lib/storySequence';
import StoryViewer from '../../../components/stories/StoryViewer';
import Loading from '../../../components/Loading';

export default function StoryRoute() {
  const params = useParams<{ nickname: string; storyId: string }>();
  const router = useRouter();
  const stories = useResource<Story[]>('/stories');

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace('/');
  }, [router]);

  const seen = useCallback((story: Story) => {
    void request(`/stories/${story.storyId}/view`, 'POST').catch(() => {});
  }, []);

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
