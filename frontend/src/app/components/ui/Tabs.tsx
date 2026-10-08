'use client';

import { useRef } from 'react';

export default function Tabs({ tabs, value, onChange, label, className = '' }: {
  tabs: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  function select(next: string) {
    onChange(next);
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
