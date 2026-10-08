'use client';

import { Maximize2, SquarePen, X, MessageCircle } from 'lucide-react';
import IconButton from '../ui/IconButton';
import ConversationRow, { type ConversationItem } from './ConversationRow';

function RowSkeleton() {
  return <div aria-hidden="true" className="dock-row-skel">
    <span className="dock-skel dock-skel-face" />
    <span className="min-w-0 flex-1">
      <span className="dock-skel block h-3.5 w-32" />
      <span className="dock-skel mt-2 block h-2.5 w-24" />
    </span>
  </div>;
}

export default function DockList({ items, loading, error, onRetry, onExpand, onClose, onCompose }: {
  items: ConversationItem[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onExpand: () => void;
  onClose: () => void;
  onCompose: () => void;
}) {
  return <>
    <header className="dock-header dock-list-head">
      <span className="dock-title">Messages</span>
      <span className="ml-auto flex items-center gap-1">
        <IconButton label="Open messages" className="dock-icon" onClick={onExpand}><Maximize2 aria-hidden="true" /></IconButton>
        <IconButton label="Close messages" className="dock-icon" onClick={onClose}><X aria-hidden="true" /></IconButton>
      </span>
    </header>
    <div className="dock-scroll">
      {loading && Array.from({ length: 5 }, (_, index) => <RowSkeleton key={index} />)}
      {!loading && error && <div className="dock-error" role="alert">
        <span>Couldn&apos;t load messages</span>
        <button type="button" className="dock-primary" onClick={onRetry}>Retry</button>
      </div>}
      {!loading && !error && items.length === 0 && <div className="dock-empty">
        <span className="dock-empty-icon"><MessageCircle aria-hidden="true" /></span>
        <p>No messages yet</p>
        <button type="button" className="dock-primary" onClick={onCompose}>Send message</button>
      </div>}
      {!loading && !error && items.map(item => <ConversationRow key={item.key} item={item} active={false} />)}
    </div>
    <button type="button" aria-label="New message" className="dock-fab" onClick={onCompose}><SquarePen aria-hidden="true" /></button>
  </>;
}
