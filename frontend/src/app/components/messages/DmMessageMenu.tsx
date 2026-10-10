'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export default function DmMessageMenu({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [flip, setFlip] = useState(false);
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
  return <details
    ref={menu}
    name="message-actions"
    data-message-actions
    data-flip={flip}
    className="relative"
    onToggle={event => {
      const element = event.currentTarget;
      if (!element.open) return;
      // These actions hang off a message near the foot of the thread; opening
      // downward there runs the menu off the viewport, so flip it upward when
      // there is not enough room below.
      setFlip(window.innerHeight - element.getBoundingClientRect().bottom < 200);
    }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}
  >
    <summary
      aria-label="Message actions"
      className="dm-action list-none"
      onClick={() => {
        document.querySelectorAll<HTMLDetailsElement>('details[data-message-actions][open]').forEach(other => {
          if (other !== menu.current) other.open = false;
        });
      }}
    >
      <MoreHorizontal aria-hidden="true" />
    </summary>
    <div
      className="dm-menu text-sm"
      onClick={event => { if ((event.target as HTMLElement).closest('button') && menu.current) menu.current.open = false; }}
    >
      {children}
    </div>
  </details>;
}
