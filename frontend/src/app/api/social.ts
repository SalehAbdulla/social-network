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
  // Per-field switches: a contact field reaches other people only while its own switch is on.
  // The owner always reads the values back, so the edit form can change them or flip a switch
  // without the stored value being lost.
  showWebsite: boolean;
  showContactEmail: boolean;
  showPhone: boolean; 
  isPublic: boolean; 
  createdAt: string;
  followers: string[]; 
  following: string[];
  // Viewer-relative: the posts this viewer may read, so the header's count and the
  // page below it always agree.
  postCount: number;
  pendingIncoming: boolean;
  pendingOutgoing: boolean;
  // Viewer-relative: the backend only allows a private chat when at least one of
  // the two users follows the other, or the other profile is public.
  canMessage?: boolean;
}
export interface FollowRequest { userId: string; nickname: string; createdAt: string }
/**
 * One account in the feed's "Suggested for you" column, from `GET /users/suggestions`.
 * `mutuals` names (up to two) the people the viewer follows who also follow this account,
 * and `mutualCount` is the whole number — together they word the row's second line.
 */
export interface UserSuggestion {
  userId: string; nickname: string; firstName: string; lastName: string;
  avatar: string; isPublic: boolean; mutuals: string[]; mutualCount: number;
}
export interface Post {
  postId: string; userId: string; nickname: string; firstName: string; lastName: string; title: string; content: string;
  imageUrls: string[]; privacy: 'public' | 'followers' | 'selected'; selectedFollowerIds?: string[];
  score: number; userScore: number; commentsCounter: number; createdAt: string; updatedAt: string;
  // Viewer-relative: true when the signed-in member has this post bookmarked.
  isSaved: boolean;
}

/** One day's reactions, as a post's author insights group them. `day` is `YYYY-MM-DD`, UTC. */
export interface ReactionDay { day: string; total: number; up: number; down: number }

/**
 * The author's own numbers for a post. `reach.audience` names the rule that admitted the
 * audience — not the post's privacy column — because a `public` post by a private profile
 * reaches followers only, the same distinction `audienceSummary` draws for the composer.
 */
export interface PostInsights {
  postId: string;
  reach: { audience: 'everyone' | 'followers' | 'selected'; count: number };
  reactions: number; up: number; down: number; comments: number;
  days: ReactionDay[];
}

/** The three privacy levels, worded the way the feed chip and the composer show them. */
export const PRIVACY_LABEL: Record<Post['privacy'], string> = {
  public: 'Public',
  followers: 'Followers only',
  selected: 'Selected followers',
};

/**
 * Who will actually be able to read a draft, in the reader's words.
 *
 * This is a wording, not a rule: the rule lives in the server's `postVisibility`
 * clause (`backend/pkg/app/repositories/PostRepository.go`), and this function is
 * written against it rather than against the three labels above. Two things follow
 * from that clause and are easy to get wrong:
 *
 * - a `public` post reaches everyone only while the *author's* profile is public;
 *   once it is private, even a public post needs the viewer to follow the author;
 * - nothing about the *viewer's* own profile privacy ever narrows a post — the SQL
 *   keys on the author's `isPublic` and on whether the viewer follows the author —
 *   so the only profile whose privacy changes the answer is the author's.
 *
 * Keep the mapping here and in that clause in step; there is deliberately one place
 * for the sentence so the composer and any future reader cannot word it differently.
 */
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

/** Up to two names, then a count, so the banner stays one line for a long list. */
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
/** One photo in a profile's media tab, from a post or from a comment. */
export interface MediaItem { url: string; postId: string; title: string; createdAt: string }
export interface Story {
  storyId: number; userId: string; nickname: string; avatar: string; content: string;
  mediaUrl: string; mediaType: 'text' | 'image' | 'video'; backgroundColor: string; createdAt: string; expiresAt: string;
  // Viewer-relative, like a post's `isSaved`: false until this account has opened the
  // story, which is what the ring in the strip is drawn from.
  viewed: boolean;
  // The heart: `liked` is whether this viewer has liked the story and `likeCount` is its
  // total, both folded into the listing so the viewer shows the state left behind.
  liked: boolean; likeCount: number;
}
/** One account in a story's "seen by" list, which only the story's author is offered. */
export interface StoryViewer { userId: string; nickname: string; avatar: string; viewedAt: string }
/** One reply left on a story, read back to the story's author alone. */
export interface StoryReply { replyId: number; storyId: number; userId: string; nickname: string; avatar: string; content: string; createdAt: string }

/**
 * Sets or clears this account's like on a story, reusing the app's one reaction endpoint:
 * a score of 1 is the heart, 0 takes it back. The response carries the new total, but the
 * viewer applies the change optimistically and never waits on it.
 */
export function reactToStory(storyId: number, liked: boolean) {
  return request('/reactions', 'POST', { entityType: 'story', entityId: String(storyId), score: liked ? 1 : 0 });
}
export interface ChatUser { userId: string; nickname: string; firstName: string; lastName: string; avatar: string; isOnline: number; lastMessageTime: string }
export interface ChatMessage {
  messageId: number; senderId: string; recipientId: string; textMessage: string; timeStamp: string;
  isRead: number; mediaUrl: string; mediaType: string; editedAt: string;
  // Viewer-relative, like a post's: the message's reaction total, and this reader's own.
  score: number; userScore: number;
}
/** One attachment in a direct conversation, from the chat's media tab. */
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

/**
 * Replaces the signed-in account's password. The backend rotates the session in
 * the same request, so the response's cookie is the one this tab must keep
 * using; every other browser signed in to the account is signed out.
 */
export async function changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
  await request('/users/me/password', 'PUT', { currentPassword, newPassword, confirmPassword });
}

/**
 * One account a browser has saved, from `GET /auth/accounts`. The session token
 * that makes switching possible is deliberately absent: it stays in a server-owned
 * HttpOnly cookie, so the page can offer the account without ever holding the
 * credential.
 */
export interface SavedAccount {
  userId: string; nickname: string; firstName: string; lastName: string; avatar: string;
}

export interface SavedAccounts {
  accounts: SavedAccount[];
  activeUserId: string;
}

/** The accounts saved on this browser, newest first, and which one is active. */
export function savedAccounts(): Promise<SavedAccounts> {
  return request('/auth/accounts', 'GET');
}

/** Makes a saved account active without a password; the server swaps the cookie. */
export async function switchAccount(userId: string): Promise<void> {
  await request('/auth/switch', 'POST', { userId });
}

/**
 * Forgets one saved account on this browser and revokes its session. When it was
 * the active account the response names the next one, or "" when nothing is left.
 */
export function removeSavedAccount(userId: string): Promise<SavedAccounts> {
  return request('/auth/accounts/remove', 'POST', { userId });
}

/** The message both reset endpoints answer with, so the copy lives on the server. */
export interface ResetMessage { message: string }

/*
 * Asks the backend to send a reset link. A resolved promise does *not* mean the
 * address has an account: the answer is the same either way, on purpose, so the
 * caller must not turn it into "check your inbox, it definitely exists". The
 * session-expired notification is switched off because these pages are used by
 * people who cannot sign in — firing it would be nonsense here.
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const result = await request<ResetMessage>('/auth/password-reset', 'POST', { email }, undefined, false);
  return result.message;
}

/**
 * Redeems the token from the link. The backend revokes every session the account
 * had, this browser included, so the caller sends the visitor back to sign in.
 */
export async function resetPassword(token: string, password: string, confirmPassword: string): Promise<string> {
  const result = await request<ResetMessage>('/auth/password-reset/confirm', 'POST', { token, password, confirmPassword }, undefined, false);
  return result.message;
}

/**
 * Uploads one file and answers with its media URL and the type the server stored.
 *
 * The checks here repeat what the picker already did, for the paths that do not go
 * through it — and they answer with the file's own size rather than with the
 * ceiling alone, so a refusal names the thing the reader chose. The server checks
 * the same limits again from the bytes themselves; this is the sooner, friendlier
 * half of a rule that is enforced there.
 */
export async function upload(file: File, signal?: AbortSignal): Promise<{ url: string; mediaType: 'image' | 'video' }> {
  if (!file.size) throw new Error('The selected file is empty.');
  if (!isImageType(file.type) && !isVideoType(file.type)) throw new Error('Choose a JPEG, PNG, GIF, WebP, MP4 or WebM file.');
  if (file.size > (isVideoType(file.type) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) throw new Error(oversizeMessage(file));
  // The shrink happens here rather than at each caller, so the composer, an avatar, a
  // cover, a chat attachment and a group photo all send the capped bytes. The ceiling
  // above is on the file the reader chose, on purpose: the picker already refuses an
  // oversize selection with that exact sentence, and a second gate that quietly
  // reversed it would leave the two disagreeing about what is allowed.
  const prepared = await prepareUpload(file);
  const form = new FormData();
  form.append('file', prepared);
  // `signal` lets the create-post dialog abandon an upload when the reader discards a
  // failed share, so the request does not keep running after the dialog is gone.
  return request('/media', 'POST', form, signal);
}

/**
 * The name to show for a person, or their handle when there is no name.
 *
 * It is built from the parts that are actually there rather than interpolated blindly.
 * A response that predates the name fields — an older backend during a staggered
 * deploy, or an author row with none — arrives with them absent or blank, and
 * `` `${undefined} ${undefined}` `` would print "undefined undefined" into the header.
 * Falling back to the handle is what a card wants anyway.
 */
export function displayName(user: { firstName?: string; lastName?: string; nickname?: string }) {
  const name = [user.firstName, user.lastName].filter(part => typeof part === 'string' && part.trim()).join(' ').trim();
  return name || user.nickname || 'Member';
}

/**
 * Bookmarks. Both writes are idempotent on the server — saving a post that is
 * already saved, or un-saving one that is not, answers 200 with the resulting
 * state — so the caller only has to decide what to show while the request is in
 * flight, not guard against a double click.
 */
export async function savePost(postId: string): Promise<void> {
  await request(`/posts/${postId}/save`, 'POST');
}

export async function unsavePost(postId: string): Promise<void> {
  await request(`/posts/${postId}/save`, 'DELETE');
}

/**
 * SQLite timestamps are UTC and do not include a zone suffix, so a bare date is
 * read as UTC rather than as the visitor's local time. Returns null when the value
 * is not a date at all, which keeps every formatter below from printing "Invalid
 * Date" into the page.
 */
function parseTimestamp(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The exact instant, for a `title` or a `dateTime` attribute. */
export function isoTimestamp(value: string): string {
  return parseTimestamp(value)?.toISOString() ?? '';
}

export function dateLabel(value: string) {
  return parseTimestamp(value)?.toLocaleString() ?? '';
}

/**
 * The day something happened, without the clock time — the label for anything older than the
 * relative window.
 *
 * A feed entry from a few weeks back is described by its date ("September 17, 2026"), not by
 * the second it was written, which is what Instagram shows and what a reader can actually use.
 * The exact instant stays available through `dateLabel`, which callers put on the `title` of the
 * `<time>` element, so the precision is a hover away instead of in the reader's face.
 */
export function dayLabel(value: string) {
  return parseTimestamp(value)?.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) ?? '';
}

/**
 * How long ago something happened, worded by the visitor's own locale.
 *
 * `Intl.RelativeTimeFormat` is used instead of a plural table because it knows the
 * language and its wording — `numeric: 'auto'` lets a locale say "yesterday"
 * rather than "1 day ago" where it has a word for it. The last week is relative,
 * because that is when "3 hours ago" tells a reader more than a timestamp does;
 * anything older falls back to `dateLabel`, where the opposite is true.
 *
 * The value is computed at render time, so a list that never re-renders shows a
 * label frozen at the last refresh. That is the trade a relative label makes, and
 * these surfaces refresh on their own (live polling, socket events).
 */
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

/**
 * The short, Instagram-style age the story viewer's header shows — `now`, `2m`, `19h`,
 * `3d`, `1w`. It is deliberately terser than `relativeLabel`: a story lives 24 hours, and
 * the header's line has an avatar and two controls to sit beside.
 */
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
