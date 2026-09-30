/**
 * The unsent post, kept in `localStorage` so a refresh does not lose it.
 *
 * What comes back is the text and the audience, not the photos: a `File` cannot be
 * serialised, and a blob URL from the previous document would point at nothing. The
 * composer therefore says which parts were restored instead of presenting a
 * half-restored draft as the whole thing.
 *
 * A draft belongs to a *new* post and is cleared the moment one is published, so
 * opening the editor for an existing post never offers those words back. Storage is
 * best-effort in the same way as `lib/theme.ts`: a blocked or full store costs
 * persistence, never the composer.
 */
import type { Post } from '../api/social';

export const POST_DRAFT_STORAGE_KEY = 'social:post-draft';

export type PostDraft = {
  title: string;
  content: string;
  privacy: Post['privacy'];
  selectedFollowerIds: string[];
  savedAt: number;
};

const PRIVACY_VALUES: Post['privacy'][] = ['public', 'followers', 'selected'];

/** Whether there is anything worth keeping. An empty composer stores nothing. */
export function draftHasContent(title: string, content: string): boolean {
  return Boolean(title.trim() || content.trim());
}

/**
 * The draft as the composer last left it, or `null` when there is nothing usable.
 *
 * Every field is re-validated rather than trusted: the entry can have been written
 * by an older version of this app, edited by hand, or left half-written by a crash,
 * and a composer that throws on mount because of one bad string is worse than one
 * that quietly starts empty.
 */
export function readPostDraft(): PostDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(POST_DRAFT_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const draft = parsed as Partial<PostDraft>;
    const title = typeof draft.title === 'string' ? draft.title : '';
    const content = typeof draft.content === 'string' ? draft.content : '';
    if (!draftHasContent(title, content)) return null;
    return {
      title,
      content,
      privacy: PRIVACY_VALUES.includes(draft.privacy as Post['privacy']) ? draft.privacy as Post['privacy'] : 'public',
      selectedFollowerIds: Array.isArray(draft.selectedFollowerIds) ? draft.selectedFollowerIds.filter(id => typeof id === 'string') : [],
      savedAt: typeof draft.savedAt === 'number' ? draft.savedAt : 0,
    };
  } catch {
    // Unreadable storage or unparsable JSON: start empty rather than refuse to open.
    return null;
  }
}

export function writePostDraft(draft: PostDraft): void {
  try {
    window.localStorage.setItem(POST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Persistence is a convenience here; the composer keeps working without it.
  }
}

export function clearPostDraft(): void {
  try {
    window.localStorage.removeItem(POST_DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to undo: the draft simply stays until it is overwritten.
  }
}
