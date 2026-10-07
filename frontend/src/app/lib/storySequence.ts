/**
 * The sequencing behind the stories viewer.
 *
 * It is pure — no React, no DOM, no timers — so the ordering rules (play a user's stories
 * oldest first, cross from one user onto the next, close after the last one, restart at the
 * start) can be tested on their own. `useStoryPlayer` supplies the timing and the DOM; this
 * module only answers "which story comes next".
 */

/** The least a story must expose to be sequenced: an id and whether this viewer has seen it. */
export interface SequencedStory {
  storyId: number;
  userId: string;
  viewed: boolean;
}

/** One author's stories, in the order they should play. */
export interface StoryGroup<T extends SequencedStory = SequencedStory> {
  userId: string;
  stories: T[];
}

/** A spot in the carousel: which author, and which of their stories. */
export interface Position {
  user: number;
  story: number;
}

/**
 * Groups a flat listing into one group per author, keeping the order of first appearance —
 * which is the server's own order, unseen author first. Within an author a story the viewer has
 * not opened plays before one they have, so a ring lands on something new, and each run stays in
 * the order it was shot (oldest first). A story that has just been viewed therefore moves to the
 * end of its author's run.
 */
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

/** Where a user's playback begins: their first unseen story, or the first one if all are seen. */
export function firstUnseenIndex(stories: SequencedStory[]): number {
  const index = stories.findIndex(story => !story.viewed);
  return index === -1 ? 0 : index;
}

/** The position of a specific story, or null when it is not in the listing. */
export function findPosition<T extends SequencedStory>(groups: StoryGroup<T>[], storyId: number): Position | null {
  const user = groups.findIndex(group => group.stories.some(story => story.storyId === storyId));
  if (user === -1) return null;
  const story = groups[user].stories.findIndex(item => item.storyId === storyId);
  return { user, story };
}

/**
 * The position to open an author at — used by a deep link, which knows the handle and maybe a
 * story id but not an index. An unknown story (or none) opens at that author's first unseen.
 */
export function positionForUser<T extends SequencedStory>(groups: StoryGroup<T>[], userId: string, storyId?: number): Position | null {
  const user = groups.findIndex(group => group.userId === userId);
  if (user === -1) return null;
  const stories = groups[user].stories;
  const story = storyId == null ? -1 : stories.findIndex(item => item.storyId === storyId);
  return { user, story: story === -1 ? firstUnseenIndex(stories) : story };
}

/** The default entry point with no targeting: the first author's first unseen story. */
export function startPosition<T extends SequencedStory>(groups: StoryGroup<T>[]): Position | null {
  return groups.length ? { user: 0, story: firstUnseenIndex(groups[0].stories) } : null;
}

/**
 * The next story: the next one by the same author, else the first of the next author, else
 * null — which is the signal to close the viewer after the very last story.
 */
export function nextPosition<T extends SequencedStory>(groups: StoryGroup<T>[], pos: Position): Position | null {
  const group = groups[pos.user];
  if (!group) return null;
  if (pos.story + 1 < group.stories.length) return { user: pos.user, story: pos.story + 1 };
  if (pos.user + 1 < groups.length) return { user: pos.user + 1, story: 0 };
  return null;
}

/**
 * The previous story: within the author, else the previous author's last story. At the very
 * first story there is nowhere to go, so it returns the same position — the caller restarts
 * that story rather than leaving the viewer.
 */
export function prevPosition<T extends SequencedStory>(groups: StoryGroup<T>[], pos: Position): Position {
  if (pos.story > 0) return { user: pos.user, story: pos.story - 1 };
  if (pos.user > 0) return { user: pos.user - 1, story: groups[pos.user - 1].stories.length - 1 };
  return { user: pos.user, story: pos.story };
}

/** The story at a position, or null when the position is out of range. */
export function storyAt<T extends SequencedStory>(groups: StoryGroup<T>[], pos: Position): T | null {
  return groups[pos.user]?.stories[pos.story] ?? null;
}

/** A story that also knows when it expires, so "still live" can be tested without the DOM. */
export interface ExpiringStory extends SequencedStory {
  expiresAt: string;
}

/**
 * Parses a stored timestamp to epoch milliseconds, or null when it cannot be read. The server
 * writes SQLite's `YYYY-MM-DD HH:MM:SS` in UTC, so a value without a zone is taken as UTC; a
 * value that already carries a `Z` or an offset is left alone.
 */
function parseInstant(value: string): number | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const at = Date.parse(zoned);
  return Number.isNaN(at) ? null : at;
}

/** Whether a story is still within its 24 hours. An unreadable date is treated as live. */
export function isLive(story: ExpiringStory, now: number = Date.now()): boolean {
  const expires = parseInstant(story.expiresAt);
  return expires === null || expires > now;
}

/**
 * Whether an author has anything new to show: at least one still-live, unseen story. Expired
 * stories are ignored, so an author whose only unseen story has lapsed reads as seen.
 *
 * Authorship is not this function's business — the caller passes every author's stories, and the
 * tray forces the viewer's *own* ring to seen, because you are never surprised by your own story.
 */
export function authorHasUnseen(stories: ExpiringStory[], now: number = Date.now()): boolean {
  return stories.some(story => isLive(story, now) && !story.viewed);
}
