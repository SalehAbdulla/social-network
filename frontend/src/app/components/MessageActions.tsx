'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function MessageActions({ label, children }: { label: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return <details ref={menu} name="message-actions" data-message-actions className="relative ml-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
  }}>
    <summary aria-label={label} className="cursor-pointer list-none px-2 text-sm" onClick={() => {
      document.querySelectorAll<HTMLDetailsElement>('details[data-message-actions][open]').forEach(other => {
        if (other !== menu.current) other.open = false;
      });
    }}>•••</summary>
    <div className="absolute right-0 z-10 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-lg" onClick={event => {
      if ((event.target as HTMLElement).closest('button') && menu.current) menu.current.open = false;
    }}>{children}</div>
  </details>;
}
