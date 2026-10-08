import type { ReactNode } from 'react';
import { Bell, Inbox, MessageCircle, Users } from 'lucide-react';

export type RequestStateVariant = 'feed' | 'notifications' | 'messages' | 'groups';

const ILLUSTRATION: Record<RequestStateVariant, ReactNode> = {
  feed: <Inbox size={26} strokeWidth={1.5} />,
  notifications: <Bell size={26} strokeWidth={1.5} />,
  messages: <MessageCircle size={26} strokeWidth={1.5} />,
  groups: <Users size={26} strokeWidth={1.5} />,
};

export default function RequestState({ empty, variant, children }: { empty?: string; variant?: RequestStateVariant; children?: ReactNode }) {
  const illustration = variant ? ILLUSTRATION[variant] : null;
  return <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center text-muted">
    {illustration && <div aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-muted">{illustration}</div>}
    {empty && <p>{empty}</p>}
    {children}
  </div>;
}

