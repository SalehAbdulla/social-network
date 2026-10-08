'use client';

import { Send } from 'lucide-react';

export default function EmptyChat({ onNew }: { onNew: () => void }) {
  return <div className="dm-empty">
    <div className="dm-empty-icon" aria-hidden="true"><Send /></div>
    <h1 className="dm-empty-title">Your messages</h1>
    <p className="dm-empty-text">Send private photos and messages to a friend or group</p>
    <button type="button" className="dm-primary" onClick={onNew}>Send message</button>
  </div>;
}
