'use client';

import { Check } from 'lucide-react';
import Button from '../../ui/Button';
import { type GroupItem } from './groupContent';

/**
 * The two answers to an event, drawn once so the Events tab and the event's card in the chat
 * stream cannot drift apart. Both are the shared button — 32px, an 8px radius, 14px/600 — and
 * the chosen one is the filled blue with a check on it, the way the group has always answered.
 * While a write is in flight both are disabled, which is what stops a double answer.
 */
export default function GroupRsvp({ item, busy, onRsvp }: {
  item: GroupItem;
  busy: boolean;
  onRsvp: (item: GroupItem, status: string) => void;
}) {
  return <div className="grp-rsvp">
    {(['going', 'not_going'] as const).map(status => {
      const selected = item.rsvp === status;
      return <Button
        key={status}
        variant={selected ? 'primary' : 'secondary'}
        aria-pressed={selected}
        disabled={busy}
        onClick={() => onRsvp(item, status)}
      >{selected && <Check aria-hidden="true" />}{status === 'going' ? 'Going' : 'Not going'}</Button>;
    })}
  </div>;
}
