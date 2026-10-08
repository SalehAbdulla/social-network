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
      onShared={post => onShared?.(post)}
    />
    : null;
  return { open, close, isOpen, modal };
}
