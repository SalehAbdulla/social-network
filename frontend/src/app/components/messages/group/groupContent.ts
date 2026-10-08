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
