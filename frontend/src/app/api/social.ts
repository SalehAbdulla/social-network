import axios from 'axios';
import api from './axios';

export const devUserEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_USER === 'true';

export interface SocialUser {
  userId: string; nickname: string; firstName: string; lastName: string;
  bio: string; avatar: string; coverPhoto: string; location: string; isPublic: boolean; createdAt: string;
  followers: string[]; following: string[];
}
export interface Post {
  postId: number; userId: string; nickname: string; title: string; content: string;
  imageUrls: string[]; privacy: 'public' | 'followers' | 'selected'; selectedFollowerIds?: string[];
  score: number; userScore: number; commentsCounter: number; createdAt: string; updatedAt: string;
}
export interface Page<T> { posts: T[]; totalPages: number; totalElements: number; lastPage: boolean }
export interface Comment {
  commentId: number; postId: number; userId: string; nickname: string; commentText: string;
  score: number; userScore: number; createdAt: string;
}
export interface Story {
  storyId: number; userId: string; nickname: string; avatar: string; content: string;
  mediaUrl: string; mediaType: 'text' | 'image' | 'video'; backgroundColor: string; createdAt: string; expiresAt: string;
}
export interface ChatUser { userId: string; nickname: string; isOnline: number; lastMessageTime: string }
export interface ChatMessage {
  messageId: number; senderId: string; recipientId: string; textMessage: string; timeStamp: string;
  isRead: number; mediaUrl: string; mediaType: string; editedAt: string;
}
export interface Notification {
  notificationId: number; actorId: string; actorNickname: string; entityType: string; entityId: number; postId?: number; isRead: number; createdAt: string;
}
export type FollowLists = Record<'followers' | 'following', SocialUser[]>;
export interface Group { groupId: number; ownerId: string; ownerName: string; title: string; description: string; memberCount: number; isMember: boolean; isOwner: boolean; joinRequested: boolean; createdAt: string }
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

export async function upload(file: File): Promise<{ url: string; mediaType: 'image' | 'video' }> {
  const limit = file.type.startsWith('image/') ? 10 : 50;
  if (file.size > limit * 1024 * 1024) throw new Error(`Files must be smaller than ${limit} MB.`);
  const form = new FormData();
  form.append('file', file);
  return request('/media', 'POST', form);
}

export function displayName(user: SocialUser) { return `${user.firstName} ${user.lastName}`.trim() || user.nickname; }
export function dateLabel(value: string) {
  // SQLite timestamps are UTC and do not include a zone suffix.
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}
