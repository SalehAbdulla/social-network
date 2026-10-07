'use client';

import { useRef } from 'react';
import { Bookmark, Clapperboard, Heart, LayoutGrid, type LucideIcon } from 'lucide-react';

/**
 * The profile's tab strip. Icon-only, each tab a fixed 179px with the icon centred and its name
 * carried by both `aria-label` and `title`; the active tab is marked by a short line under its
 * icon, the one Instagram uses on the profile, rather than the filled pill the rest of the app
 * draws.
 */
export type ProfileTab = 'posts' | 'media' | 'likes' | 'saved';

const META: Record<ProfileTab, { label: string; icon: LucideIcon }> = {
  posts: { label: 'Posts', icon: LayoutGrid },
  media: { label: 'Media', icon: Clapperboard },
  likes: { label: 'Likes', icon: Heart },
  saved: { label: 'Saved', icon: Bookmark },
};

export default function ProfileTabs({ tabs, value, onChange, label }: {
  tabs: ProfileTab[];
  value: ProfileTab;
  onChange: (tab: ProfileTab) => void;
  /** Names the strip for assistive technology, e.g. "Profile". */
  label: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  function select(next: ProfileTab) {
    onChange(next);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }
  function step(delta: number) {
    const index = tabs.indexOf(value);
    select(tabs[(index + delta + tabs.length) % tabs.length]);
  }
  return <div ref={list} role="tablist" aria-label={label} className="profile-tabs">
    {tabs.map(tab => {
      const meta = META[tab];
      const Icon = meta.icon;
      return <button
        key={tab}
        data-tab={tab}
        type="button"
        role="tab"
        id={`profile-tab-${tab}`}
        aria-selected={value === tab}
        aria-controls={`profile-panel-${tab}`}
        aria-label={meta.label}
        title={meta.label}
        tabIndex={value === tab ? 0 : -1}
        className="profile-tab"
        onClick={() => onChange(tab)}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
          else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
          else if (event.key === 'Home') { event.preventDefault(); select(tabs[0]); }
          else if (event.key === 'End') { event.preventDefault(); select(tabs[tabs.length - 1]); }
        }}
      ><Icon aria-hidden="true" /></button>;
    })}
  </div>;
}
