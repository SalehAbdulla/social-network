'use client';

import { useCallback, useState } from 'react';
import { type Post } from '../api/social';
import CreatePostModal from '../components/create-post/CreatePostModal';
import { type CreateContext } from '../components/create-post/types';

/**
 * One hook behind every create-post entry point.
 *
 * `open()` shows the dialog and `modal` is the dialog itself, rendered by whichever component owns
 * the trigger — so the sidebar, the bottom bar, the feed row, the profile's empty state and a group
 * all speak the same flow. A group passes its id and name, and the same dialog writes a group post
 * with the group named in place of the audience picker. `onShared` lets the surface fold the new
 * post in optimistically without a reload.
 */
export function useCreatePost(options: {
  context?: CreateContext;
  groupId?: string;
  groupName?: string;
  groupAvatar?: string;
  onShared?: (post?: Post) => void;
} = {}) {
  const { context = 'feed', groupId, groupName = '', groupAvatar = '', onShared } = options;
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const modal = isOpen
    ? <CreatePostModal
      context={context}
      groupId={groupId}
      groupName={groupName}
      groupAvatar={groupAvatar}
      onClose={close}
      onShared={post => onShared?.(post)}
    />
    : null;
  return { open, close, isOpen, modal };
}
