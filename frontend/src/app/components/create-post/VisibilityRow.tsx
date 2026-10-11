'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type SocialUser, displayName } from '../../api/social';
import { ROW } from './rows';
import { VISIBILITY_OPTIONS, type Visibility } from './visibility';

export default function VisibilityRow({ id, value, onChange, followers, selected, onToggle, loading, name = 'cp-privacy' }: {
  id?: string;
  value: Visibility;
  onChange: (value: Visibility) => void;
  followers: SocialUser[];
  selected: string[];
  onToggle: (id: string) => void;
  loading: boolean;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = VISIBILITY_OPTIONS.find(option => option.value === value) ?? VISIBILITY_OPTIONS[0];
  return <>
    <button id={id} type="button" className={`group ${ROW}`} aria-expanded={open} onClick={() => setOpen(previous => !previous)}>
      <current.Icon size={20} aria-hidden="true" />
      <span className="cp-row-label">Visibility</span>
      <span className="cp-row-value">{current.label}</span>
      <ChevronDown className="h-4 w-4 text-muted transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </button>
    {open && <div className="cp-sub" role="radiogroup" aria-label="Audience">
      {VISIBILITY_OPTIONS.map(option => <label key={option.value} className="cp-radio">
        <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
        <span className="cp-radio-text">
          <span className="cp-radio-title">{option.label}</span>
          <span className="cp-radio-desc">{option.desc}</span>
        </span>
      </label>)}
      {value === 'selected' && <div className="cp-selected-list">
        {loading && <span className="cp-radio-desc">Loading followers…</span>}
        {!loading && followers.length === 0 && <span className="cp-radio-desc">You do not have any followers yet.</span>}
        {followers.map(person => <label key={person.userId} className="cp-chip">
          <input type="checkbox" checked={selected.includes(person.userId)} onChange={() => onToggle(person.userId)} />
          <span dir="auto">{displayName(person)}</span>
        </label>)}
      </div>}
    </div>}
  </>;
}
