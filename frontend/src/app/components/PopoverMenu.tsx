'use client';

import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';

/**
 * The app's one floating menu: the surface, its rows, and its keyboard behaviour.
 *
 * The rail's Create and More popovers and a post header's "…" menu all draw from here, so a menu
 * item looks and behaves the same wherever it is opened. The panel is `fixed` and positioned from
 * the trigger's rect, so it floats out of whatever contains it instead of being clipped by it, and
 * scrolling the page underneath cannot move it.
 */

/** One row inside a menu popover: ~50px tall, 16px text, hover background. Shared with the Link
 *  rows so a route and an action are drawn identically. The text colour is deliberately not in
 *  here: the panel's rows inherit the app's colour, and a row that needs its own — the destructive
 *  one — sets exactly one colour class rather than two that a stylesheet order would arbitrate. */
export const menuRowClass = 'flex min-h-[50px] w-full items-center gap-3 rounded-[12px] px-3 text-left hover:bg-rail-hover focus:bg-rail-hover focus:outline-none disabled:opacity-50';

/** `danger` is the destructive row: same shape, the danger colour, so Delete reads as one. */
export function MenuItem({ onClick, children, disabled = false, danger = false }: {
  onClick: () => void; children: ReactNode; disabled?: boolean; danger?: boolean;
}) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={`${menuRowClass} ${danger ? 'text-danger' : 'text-text'}`}>{children}</button>;
}

/**
 * Focus moves to the first item on open, and the arrow keys and Tab cycle the items. Escape and
 * outside-click are left to whoever owns the open state, because only they know what to close.
 *
 * `placement` is where the panel sits relative to its trigger: `right` and `above` for the rail,
 * whose popovers open beside it or over it, and `below` for a menu under a button — hung from the
 * trigger's right edge, the way a post's "…" menu hangs under its own corner. `width` is a number
 * of pixels or a CSS length such as `var(--post-menu-width)`, so a menu width can be a token like
 * every other measurement; `below` is anchored by `right` rather than `left` so a token width
 * needs no arithmetic.
 */
export function MenuPanel({ rect, width, placement, label, menuRef, children }: {
  rect: DOMRect; width: number | string; placement: 'right' | 'above' | 'below'; label: string;
  menuRef: RefObject<HTMLDivElement | null>; children: ReactNode;
}) {
  useEffect(() => {
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(element => element.getClientRects().length > 0);
    items()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) return;
      const list = items();
      if (!list.length) return;
      event.preventDefault();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 1;
      list[(index + step + list.length) % list.length]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuRef]);
  const style: CSSProperties = placement === 'above'
    ? { position: 'fixed', left: rect.left, bottom: window.innerHeight - rect.top + 8, width, maxHeight: '70vh' }
    : placement === 'below'
      ? { position: 'fixed', right: Math.max(8, window.innerWidth - rect.right), top: rect.bottom + 8, width, maxHeight: '70vh' }
      : { position: 'fixed', left: rect.left + rect.width + 8, bottom: Math.max(16, window.innerHeight - rect.bottom), width, maxHeight: '70vh' };
  return <div ref={menuRef} role="menu" aria-label={label} style={style} className="z-50 overflow-y-auto rounded-[16px] border border-popover-border bg-popover p-2 font-sans leading-5 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">{children}</div>;
}
