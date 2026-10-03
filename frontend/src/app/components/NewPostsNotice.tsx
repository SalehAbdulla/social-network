'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSocketEvent } from '../lib/useSocketEvent';

/**
 * The feed's "new posts" pill, offered rather than imposed.
 *
 * A post that arrives over the socket does not replace the feed: the reader may be
 * halfway down a page, so the pill appears and pressing it is what folds the newest
 * page in (`onReload`, which merges page 1 instead of resetting the list). The server
 * sends the frame to everyone but the author, so this never appears for a post the
 * reader just wrote. It carries no count because the frame carries none — the server
 * does not know how many of the nudges a given reader may actually read — and a
 * made-up number would be worse than the plain promise that there are new posts.
 */
export default function NewPostsNotice({ onReload }: { onReload: () => void }) {
  const [pending, setPending] = useState(false);
  useSocketEvent('post_changed', () => setPending(true));
  if (!pending) return null;
  return <div className="sticky top-0 z-10 flex justify-center py-2">
    <button
      type="button"
      aria-label="Show new posts"
      onClick={() => { setPending(false); onReload(); }}
      className="chat-secondary inline-flex items-center gap-2 shadow-sm"
    >
      <RefreshCw size={14} aria-hidden="true" />New posts
    </button>
  </div>;
}
