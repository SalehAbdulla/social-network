'use client';

import { useCallback, useState } from 'react';
import { type Post } from '../api/social';
import CreatePostModal from '../components/create-post/CreatePostModal';
import { type CreateContext } from '../components/create-post/types';

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
      onShared={post => {
        onShared?.(post);
        // The buttons that open this modal live in the sidebar and the bottom
        // nav — outside the feed. A window event lets whichever feed is mounted
        // pick the post up, instead of only the one that owns the modal.
        if (post && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('social:post_created', { detail: post }));
      }}
    />
    : null;
  return { open, close, isOpen, modal };
}
