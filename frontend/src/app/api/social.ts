import axios from 'axios';
import api from './axios';

export const devUserEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_USER === 'true';

export interface SocialUser {
  userId: string; nickname: string; firstName: string; lastName: string;
  bio: string; avatar: string; coverPhoto: string; location: string; createdAt: string;
  followers: string[]; following: string[]; connections: string[]; pending: string[]; requested: string[];
}
export interface Post {
  postId: number; userId: string; nickname: string; title: string; content: string;
  imageUrls: string[]; score: number; userScore: number; commentsCounter: number; createdAt: string; updatedAt: string;
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
  notificationId: number; actorId: string; actorNickname: string; entityType: string; entityId: number; isRead: number; createdAt: string;
}
export type Connections = Record<'followers' | 'following' | 'connections' | 'pending' | 'requested', SocialUser[]>;
export interface SocketEvent { type: string; payload: Record<string, unknown> }

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.message || 'Could not reach the backend. Please try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const { data } = await api.request<{ success: boolean; data: T; error?: string }>({
      url: `/api/v1${path}`, method, data: body, signal,
    });
    if (!data.success) throw new Error(data.error || 'Request failed');
    return data.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401 && typeof window !== 'undefined') {
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
