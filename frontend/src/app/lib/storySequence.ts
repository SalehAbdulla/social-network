
export interface SequencedStory {
  storyId: number;
  userId: string;
  viewed: boolean;
}

export interface StoryGroup<T extends SequencedStory = SequencedStory> {
  userId: string;
  stories: T[];
}

export interface Position {
  user: number;
  story: number;
}

export function groupStories<T extends SequencedStory>(stories: T[]): StoryGroup<T>[] {
  const groups: StoryGroup<T>[] = [];
  const byUser = new Map<string, StoryGroup<T>>();
  for (const story of stories) {
    let group = byUser.get(story.userId);
    if (!group) {
      group = { userId: story.userId, stories: [] };
      byUser.set(story.userId, group);
      groups.push(group);
    }
    group.stories.push(story);
  }
  for (const group of groups) group.stories.sort((a, b) => a.viewed === b.viewed ? a.storyId - b.storyId : a.viewed ? 1 : -1);
  return groups;
}

export function firstUnseenIndex(stories: SequencedStory[]): number {
  const index = stories.findIndex(story => !story.viewed);
  return index === -1 ? 0 : index;
}

export function findPosition<T extends SequencedStory>(groups: StoryGroup<T>[], storyId: number): Position | null {
  const user = groups.findIndex(group => group.stories.some(story => story.storyId === storyId));
  if (user === -1) return null;
  const story = groups[user].stories.findIndex(item => item.storyId === storyId);
  return { user, story };
}

export function positionForUser<T extends SequencedStory>(groups: StoryGroup<T>[], userId: string, storyId?: number): Position | null {
  const user = groups.findIndex(group => group.userId === userId);
  if (user === -1) return null;
  const stories = groups[user].stories;
  const story = storyId == null ? -1 : stories.findIndex(item => item.storyId === storyId);
  return { user, story: story === -1 ? firstUnseenIndex(stories) : story };
}

export function startPosition<T extends SequencedStory>(groups: StoryGroup<T>[]): Position | null {
  return groups.length ? { user: 0, story: firstUnseenIndex(groups[0].stories) } : null;
}

export function nextPosition<T extends SequencedStory>(groups: StoryGroup<T>[], pos: Position): Position | null {
  const group = groups[pos.user];
  if (!group) return null;
  if (pos.story + 1 < group.stories.length) return { user: pos.user, story: pos.story + 1 };
  if (pos.user + 1 < groups.length) return { user: pos.user + 1, story: 0 };
  return null;
}

export function prevPosition<T extends SequencedStory>(groups: StoryGroup<T>[], pos: Position): Position {
  if (pos.story > 0) return { user: pos.user, story: pos.story - 1 };
  if (pos.user > 0) return { user: pos.user - 1, story: groups[pos.user - 1].stories.length - 1 };
  return { user: pos.user, story: pos.story };
}

export function storyAt<T extends SequencedStory>(groups: StoryGroup<T>[], pos: Position): T | null {
  return groups[pos.user]?.stories[pos.story] ?? null;
}

export interface ExpiringStory extends SequencedStory {
  expiresAt: string;
}

function parseInstant(value: string): number | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const at = Date.parse(zoned);
  return Number.isNaN(at) ? null : at;
}

export function isLive(story: ExpiringStory, now: number = Date.now()): boolean {
  const expires = parseInstant(story.expiresAt);
  return expires === null || expires > now;
}

export function authorHasUnseen(stories: ExpiringStory[], now: number = Date.now()): boolean {
  return stories.some(story => isLive(story, now) && !story.viewed);
}
