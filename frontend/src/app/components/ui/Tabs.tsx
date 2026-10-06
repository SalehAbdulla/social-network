'use client';

import { useRef } from 'react';

/**
 * The app's one tab strip.
 *
 * `role="tablist"` with roving tabindex: only the selected tab is in the tab order, and
 * ArrowLeft/ArrowRight (plus Home/End) move the selection and the focus together. Each tab
 * points at its panel with `aria-controls`, and the selected panel points back with
 * `aria-labelledby`, which is how a screen reader announces the pair. The tab labels are the
 * caller's; the geometry is the shared `--grp-tab-*` tokens.
 */
export default function Tabs({ tabs, value, onChange, label, className = '' }: {
  tabs: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** Names the strip for assistive technology, e.g. "Group conversation tabs". */
  label: string;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  function select(next: string) {
    onChange(next);
    // The newly selected tab may not be the one that held focus, so it is focused after the
    // render that marks it selected — which is what makes the ring follow the arrow keys.
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
  }
  function step(delta: number) {
    const index = tabs.findIndex(tab => tab.value === value);
    select(tabs[(index + delta + tabs.length) % tabs.length].value);
  }
  return <div ref={list} role="tablist" aria-label={label} className={`ui-tablist ${className}`}>
    {tabs.map(tab => <button
      key={tab.value}
      data-tab={tab.value}
      type="button"
      role="tab"
      id={`tab-${tab.value}`}
      aria-selected={value === tab.value}
      aria-controls={`panel-${tab.value}`}
      tabIndex={value === tab.value ? 0 : -1}
      className="ui-tab"
      onClick={() => onChange(tab.value)}
      onKeyDown={event => {
        if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
        else if (event.key === 'Home') { event.preventDefault(); select(tabs[0].value); }
        else if (event.key === 'End') { event.preventDefault(); select(tabs[tabs.length - 1].value); }
      }}
    >{tab.label}</button>)}
  </div>;
}
