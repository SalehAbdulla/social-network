'use client';

import { Check } from 'lucide-react';
import Button from '../../ui/Button';
import { type GroupItem } from './groupContent';

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
