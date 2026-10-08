'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { type SocialUser, displayName } from '../../api/social';
import { useResource } from '../../lib/useResource';
import { useDialogFocus } from '../../lib/useDialogFocus';
import Avatar from '../Avatar';
import Loading from '../Loading';

export default function NewMessageModal({ onClose, meId, onPick }: { onClose: () => void; meId: string; onPick?: (userId: string) => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const dialog = useDialogFocus<HTMLDivElement>(onClose, { initialFocus: input });
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const people = useResource<SocialUser[]>(`/users?q=${encodeURIComponent(query)}`);
  const list = (people.data ?? []).filter(person => person.userId !== meId);
  function start() {
    if (!selected) return;
    const partner = selected;
    onClose();
    if (onPick) onPick(partner);
    else router.push(`/messages/${partner}`);
  }
  return <div className="dm-modal" onClick={onClose}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="dm-new-message" tabIndex={-1} className="dm-modal-card" onClick={event => event.stopPropagation()}>
      <div className="dm-modal-head">
        <h2 id="dm-new-message">New message</h2>
        <button type="button" aria-label="Close" className="dm-icon" onClick={onClose}><X aria-hidden="true" /></button>
      </div>
      <div className="dm-modal-to">
        <span className="shrink-0">To:</span>
        <input ref={input} aria-label="Search people" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search..." />
      </div>
      <div className="dm-modal-list">
        {people.loading && <Loading height={60} />}
        <div role="radiogroup" aria-label="People">
          {list.map(person => <button
            key={person.userId}
            type="button"
            role="radio"
            aria-checked={selected === person.userId}
            className="dm-modal-row"
            onClick={() => setSelected(person.userId)}
          >
            <Avatar name={displayName(person)} avatarUrl={person.avatar} size={44} />
            <span className="min-w-0 flex-1">
              <span className="dm-modal-name">{displayName(person)}</span>
              <span className="dm-modal-handle">{person.nickname}</span>
            </span>
            <span className="dm-radio" aria-hidden="true" />
          </button>)}
        </div>
        {!people.loading && list.length === 0 && <p className="dm-empty-note">No people found.</p>}
      </div>
      <div className="dm-modal-foot">
        <button type="button" className="dm-primary" disabled={!selected} onClick={start}>Chat</button>
      </div>
    </div>
  </div>;
}
