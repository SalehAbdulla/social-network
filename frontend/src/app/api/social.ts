import axios from 'axios';
import api from './axios';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, isImageType, isVideoType, oversizeMessage } from '../lib/mediaLimits';
import { prepareUpload } from '../lib/downscale';

export interface SocialUser {
  userId: string;
  nickname: string;
  firstName: string;
  lastName: string;
  bio: string;
  avatar: string;
  coverPhoto: string;
  location: string;
  website: string;
  contactEmail: string;
  phone: string;
  showWebsite: boolean;
  showContactEmail: boolean;
  showPhone: boolean;
  isPublic: boolean;
  createdAt: string;
  followers: string[];
  following: string[];
  postCount: number;
  pendingIncoming: boolean;
  pendingOutgoing: boolean;
  canMessage?: boolean;
}
export interface FollowRequest { userId: string; nickname: string; createdAt: string }
export interface UserSuggestion {
  userId: string; nickname: string; firstName: string; lastName: string;
  avatar: string; isPublic: boolean; mutuals: string[]; mutualCount: number;
}
export interface Post {
  postId: string; userId: string; nickname: string; firstName: string; lastName: string; title: string; content: string;
  imageUrls: string[]; privacy: 'public' | 'followers' | 'selected'; selectedFollowerIds?: string[];
  score: number; userScore: number; commentsCounter: number; createdAt: string; updatedAt: string;
  isSaved: boolean;
}

export interface ReactionDay { day: string; total: number; up: number; down: number }

export interface PostInsights {
  postId: string;
  reach: { audience: 'everyone' | 'followers' | 'selected'; count: number };
  reactions: number; up: number; down: number; comments: number;
  days: ReactionDay[];
}

export const PRIVACY_LABEL: Record<Post['privacy'], string> = {
  public: 'Public',
  followers: 'Followers only',
  selected: 'Selected followers',
};

export function audienceSummary({ privacy, authorIsPublic, selectedNames }: {
  privacy: Post['privacy'];
  authorIsPublic: boolean;
  selectedNames: string[];
}): { headline: string; note?: string } {
  if (privacy === 'selected') {
    return { headline: selectedNames.length ? `Visible to ${listNames(selectedNames)}` : 'Visible to the followers you choose' };
  }
  if (privacy === 'followers') return { headline: 'Visible to your followers' };
  if (!authorIsPublic) {
    return {
      headline: 'Visible to your followers',
      note: 'Your profile is private, so even a public post still reaches only the people who follow you.',
    };
  }
  return { headline: 'Visible to everyone' };
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  const others = names.length - 2;
  return `${names.slice(0, 2).join(', ')} and ${others} other${others === 1 ? '' : 's'}`;
}

export interface Page<T> { posts: T[]; totalPages: number; totalElements: number; lastPage: boolean }
export interface Comment {
  commentId: number; postId: string; userId: string; nickname: string; commentText: string;
  imageUrls: string[]; score: number; userScore: number; createdAt: string;
}
export interface MediaItem { url: string; postId: string; title: string; createdAt: string }
export interface Story {
  storyId: number; userId: string; nickname: string; avatar: string; content: string;
  mediaUrl: string; mediaType: 'text' | 'image' | 'video'; backgroundColor: string; createdAt: string; expiresAt: string;
  viewed: boolean;
  liked: boolean; likeCount: number;
}
export interface StoryViewer { userId: string; nickname: string; avatar: string; viewedAt: string }
export interface StoryReply { replyId: number; storyId: number; userId: string; nickname: string; avatar: string; content: string; createdAt: string }

export function reactToStory(storyId: number, liked: boolean) {
  return request('/reactions', 'POST', { entityType: 'story', entityId: String(storyId), score: liked ? 1 : 0 });
}
export interface ChatUser { userId: string; nickname: string; firstName: string; lastName: string; avatar: string; isOnline: number; lastMessageTime: string }
export interface ChatMessage {
  messageId: number; senderId: string; recipientId: string; textMessage: string; timeStamp: string;
  isRead: number; mediaUrl: string; mediaType: string; editedAt: string;
  score: number; userScore: number;
}
export interface ConversationMedia { messageId: number; mediaUrl: string; mediaType: string; timeStamp: string }

export interface Notification {
  notificationId: number; actorId: string; actorNickname: string; entityType: string; entityId: number; postId?: string; isRead: number; createdAt: string;
}
export type FollowLists = Record<'followers' | 'following', SocialUser[]>;
export interface Group { groupId: number; ownerId: string; ownerName: string; imageUrl: string; title: string; description: string; memberCount: number; isMember: boolean; isOwner: boolean; joinRequested: boolean; createdAt: string }
export interface GroupMember { userId: string; nickname: string; firstName: string; lastName: string; avatar: string; role: string; joinedAt: string }
export interface GroupRequest { requestId: number; groupId: number; userId: string; nickname: string; status: string; createdAt: string }
export interface GroupInvitation { invitationId: number; groupId: number; userId: string; nickname: string; groupTitle: string; status: string; createdAt: string }
export interface SocketEvent { type: string; payload: Record<string, unknown> }

export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Could not reach the backend. Please try again.';
    const { data, status } = error.response;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.message === 'string') return data.message;
    if (isUnauthorized(error)) return 'Please sign in to continue.';
    if (status === 403) return 'You do not have permission to access this content.';
    if (status === 404) return 'The requested content could not be found.';
    return 'The request failed. Please try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export async function authRequest<T>(path: string, values: Record<string, string>): Promise<T> {
  const { data } = await api.post<{ success: boolean; data: T; error?: string }>(
    `/api/v1${path}`,
    new URLSearchParams(values),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  if (!data.success) throw new Error(data.error || 'Authentication failed');
  return data.data;
}

export async function nicknameAvailability(nickname: string): Promise<boolean> {
  const { data } = await api.get<{ success: boolean; data: { available: boolean }; error?: string }>(
    `/api/v1/auth/nickname-availability?nickname=${encodeURIComponent(nickname)}`,
  );
  if (!data.success) throw new Error(data.error || 'Could not check nickname availability');
  return data.data.available;
}

export async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, notifySessionExpired = true): Promise<T> {
  try {
    const { data } = await api.request<{ success: boolean; data: T; error?: string }>({
      url: `/api/v1${path}`, method, data: body, signal,
    });
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data.data;
  } catch (error) {
    if (notifySessionExpired && isUnauthorized(error) && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('social:session-expired'));
    }
    throw error;
  }
}

export async function changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
  await request('/users/me/password', 'PUT', { currentPassword, newPassword, confirmPassword });
}

export interface SavedAccount {
  userId: string; nickname: string; firstName: string; lastName: string; avatar: string;
}

export interface SavedAccounts {
  accounts: SavedAccount[];
  activeUserId: string;
}

export function savedAccounts(): Promise<SavedAccounts> {
  return request('/auth/accounts', 'GET');
}

export async function switchAccount(userId: string): Promise<void> {
  await request('/auth/switch', 'POST', { userId });
}

export function removeSavedAccount(userId: string): Promise<SavedAccounts> {
  return request('/auth/accounts/remove', 'POST', { userId });
}

export interface ResetMessage { message: string }

export async function requestPasswordReset(email: string): Promise<string> {
  const result = await request<ResetMessage>('/auth/password-reset', 'POST', { email }, undefined, false);
  return result.message;
}

export async function resetPassword(token: string, password: string, confirmPassword: string): Promise<string> {
  const result = await request<ResetMessage>('/auth/password-reset/confirm', 'POST', { token, password, confirmPassword }, undefined, false);
  return result.message;
}

export async function upload(file: File, signal?: AbortSignal): Promise<{ url: string; mediaType: 'image' | 'video' }> {
  if (!file.size) throw new Error('The selected file is empty.');
  if (!isImageType(file.type) && !isVideoType(file.type)) throw new Error('Choose a JPEG, PNG, GIF, WebP, MP4 or WebM file.');
  if (file.size > (isVideoType(file.type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) throw new Error(oversizeMessage(file));
  const prepared = await prepareUpload(file);
  const form = new FormData();
  form.append('file', prepared);
  return request('/media', 'POST', form, signal);
}

export function displayName(user: { firstName?: string; lastName?: string; nickname?: string }) {
  const name = [user.firstName, user.lastName].filter(part => typeof part === 'string' && part.trim()).join(' ').trim();
  return name || user.nickname || 'Member';
}

export async function savePost(postId: string): Promise<void> {
  await request(`/posts/${postId}/save`, 'POST');
}

export async function unsavePost(postId: string): Promise<void> {
  await request(`/posts/${postId}/save`, 'DELETE');
}

function parseTimestamp(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoTimestamp(value: string): string {
  return parseTimestamp(value)?.toISOString() ?? '';
}

export function dateLabel(value: string) {
  return parseTimestamp(value)?.toLocaleString() ?? '';
}

export function dayLabel(value: string) {
  return parseTimestamp(value)?.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) ?? '';
}

export function relativeLabel(value: string, now: number = Date.now()) {
  const date = parseTimestamp(value);
  if (!date) return '';
  let remaining = (date.getTime() - now) / 1000;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4], ['month', 12]];
  for (const [unit, span] of units) {
    if (Math.abs(remaining) < span) return formatter.format(Math.round(remaining), unit);
    remaining /= span;
  }
  return dayLabel(value);
}

export function shortAge(value: string, now: number = Date.now()): string {
  const date = parseTimestamp(value);
  if (!date) return '';
  const seconds = Math.max(0, (now - date.getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d`;
  return `${Math.floor(days / 7)}w`;
}
