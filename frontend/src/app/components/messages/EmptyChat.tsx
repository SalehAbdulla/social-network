'use client';

import { Send } from 'lucide-react';

/**
 * The chat panel with no conversation open: Instagram's paper-plane circle, its two lines
 * of copy and the button that opens the new-message modal.
 */
export default function EmptyChat({ onNew }: { onNew: () => void }) {
  return <div className="dm-empty">
    <div className="dm-empty-icon" aria-hidden="true"><Send /></div>
    <h1 className="dm-empty-title">Your messages</h1>
    <p className="dm-empty-text">Send private photos and messages to a friend or group</p>
    <button type="button" className="dm-primary" onClick={onNew}>Send message</button>
  </div>;
}
