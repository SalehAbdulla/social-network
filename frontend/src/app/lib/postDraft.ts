import type { Post } from '../api/social';

export const POST_DRAFT_STORAGE_KEY = 'social:post-draft';

export type PostDraft = {
  content: string;
  privacy: Post['privacy'];
  selectedFollowerIds: string[];
  savedAt: number;
};

const PRIVACY_VALUES: Post['privacy'][] = ['public', 'followers', 'selected'];

export function draftHasContent(content: string): boolean {
  return Boolean(content.trim());
}

export function readPostDraft(): PostDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(POST_DRAFT_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const draft = parsed as Partial<PostDraft>;
    const content = typeof draft.content === 'string' ? draft.content : '';
    if (!draftHasContent(content)) return null;
    return {
      content,
      privacy: PRIVACY_VALUES.includes(draft.privacy as Post['privacy']) ? draft.privacy as Post['privacy'] : 'public',
      selectedFollowerIds: Array.isArray(draft.selectedFollowerIds) ? draft.selectedFollowerIds.filter(id => typeof id === 'string') : [],
      savedAt: typeof draft.savedAt === 'number' ? draft.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writePostDraft(draft: PostDraft): void {
  try {
    window.localStorage.setItem(POST_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
  }
}

export function clearPostDraft(): void {
  try {
    window.localStorage.removeItem(POST_DRAFT_STORAGE_KEY);
  } catch {
  }
}
