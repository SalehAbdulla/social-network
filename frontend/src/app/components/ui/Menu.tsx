'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

/**
 * The app's one "…" menu.
 *
 * The trigger is the shared 16px muted icon, the panel is the shared popover, and the keyboard
 * contract is the same everywhere: ArrowUp/ArrowDown/Home/End move between the rows, Escape and
 * a click outside close it, and Escape hands focus back to the trigger. Only one menu is open at
 * a time — opening one closes any other — which is what keeps a post's menu and a comment's menu
 * from both standing.
 */
export function MenuItem({ onClick, children, disabled = false, tone }: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick} data-tone={tone} className="ui-menu-item">
    {children}
  </button>;
}

const OPEN_MENUS = new Set<() => void>();

export default function Menu({ label, children, className = '', align = 'end', triggerIcon: TriggerIcon = MoreHorizontal }: {
  label: string;
  children: ReactNode;
  className?: string;
  /** Which edge the panel hangs from. `end` is the "…" in a card's corner. */
  align?: 'start' | 'end';
  /** The trigger's glyph. Defaults to the shared "…"; a caller can name its own, e.g. a gear. */
  triggerIcon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(element => !element.hasAttribute('disabled'));
    items()[0]?.focus();
    const close = () => setOpen(false);
    OPEN_MENUS.add(close);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const list = items();
      if (!list.length) return;
      event.preventDefault();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'ArrowDown' ? index + 1
        : event.key === 'ArrowUp' ? index - 1
          : event.key === 'Home' ? 0 : list.length - 1;
      list[(next + list.length) % list.length]?.focus();
    };
    const onPointer = (event: PointerEvent) => { if (root.current && !root.current.contains(event.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      OPEN_MENUS.delete(close);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return <div ref={root} className={`ui-menu ${className}`}>
    <button
      ref={trigger}
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      className="ui-menu-trigger"
      onClick={() => {
        if (!open) OPEN_MENUS.forEach(close => close());
        setOpen(value => !value);
      }}
    >
      <TriggerIcon aria-hidden="true" />
    </button>
    {open && <div
      role="menu"
      aria-label={label}
      className="ui-menu-panel"
      style={align === 'start' ? { insetInlineEnd: 'auto', insetInlineStart: 0 } : undefined}
      onClick={event => { if ((event.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false); }}
    >
      {children}
    </div>}
  </div>;
}
