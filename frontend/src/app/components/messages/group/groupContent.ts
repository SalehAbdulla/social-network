import { displayName } from '../../../api/social';

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
  upcoming: boolean;
  likeCount: number;
  likedByMe: boolean;
  // A group chat message can answer an earlier one; the parent's text and author
  // come with it so the bubble shows what was replied to. Zero/empty otherwise.
  replyToId: number;
  replyToText: string;
  replyToSenderId: string;
}

export const GROUP_PAGE_SIZE = 30;

export function itemName(item: GroupItem): string {
  return displayName(item);
}

export function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function memberCount(count: number): string {
  return `${count} ${count === 1 ? 'member' : 'members'}`;
}

export function previewText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function rsvpTally(item: GroupItem): string {
  return item.going + item.notGoing > 0 ? `${item.going} going · ${item.notGoing} not going` : 'No responses yet';
}
