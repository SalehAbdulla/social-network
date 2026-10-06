import { displayName } from '../../../api/social';

/**
 * One row of a group's content stream.
 *
 * Posts, comments, chat messages, events and attachments all come back from the same
 * endpoint as this shape; `kind` and `parentId` are what tell them apart. It mirrors the
 * server's `models.GroupContent` and is declared here rather than in `api/social.ts`
 * because only the group surfaces read it.
 */
export interface GroupItem {
  id: number;
  userId: string;
  firstName: string;
  lastName: string;
  nickname: string;
  kind: string;
  parentId: number;
  title: string;
  content: string;
  mediaUrl: string;
  startsAt: string;
  createdAt: string;
  rsvp: string;
  going: number;
  notGoing: number;
  /** Decided by the server from the same SQL that orders the events tab. */
  upcoming: boolean;
  /**
   * A post's or a comment's likes, shaped the way the feed's `score`/`userScore` pair is: the
   * total, and whether this reader is one of the likers. Both come off the list row itself, so
   * a page of posts costs one query rather than one per item.
   */
  likeCount: number;
  likedByMe: boolean;
}

/** Must match `groupPageSize` in the backend's GroupContentRepository (LIMIT 31). */
export const GROUP_PAGE_SIZE = 30;

/** The uploader's name, from the row's own user columns. */
export function itemName(item: GroupItem): string {
  return displayName(item);
}

/** Attachments carry no type, so the file name decides which element draws them. */
export function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** `1 member` / `2 members` — the count the group header and list rows use. */
export function memberCount(count: number): string {
  return `${count} ${count === 1 ? 'member' : 'members'}`;
}

/** A comment or post body, trimmed to one line for a preview. */
export function previewText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** An event's answers: the running tally, or the empty state the card shows instead. */
export function rsvpTally(item: GroupItem): string {
  return item.going + item.notGoing > 0 ? `${item.going} going · ${item.notGoing} not going` : 'No responses yet';
}
