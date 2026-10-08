'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSocketEvent } from '../lib/useSocketEvent';

export default function NewPostsNotice({ onReload }: { onReload: () => void }) {
  const [pending, setPending] = useState(false);
  useSocketEvent('post_changed', () => setPending(true));
  if (!pending) return null;
  return <div className="sticky top-0 z-10 flex justify-center">
    <button
      type="button"
      aria-label="Show new posts"
      onClick={() => { setPending(false); onReload(); }}
      className="feed-notice gap-2"
    >
      <RefreshCw className="size-[var(--notice-icon)]" aria-hidden="true" />New posts
    </button>
  </div>;
}
