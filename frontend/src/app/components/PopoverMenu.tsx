'use client';

import { useEffect, type CSSProperties, type ReactNode, type RefObject } from 'react';


export const menuRowClass = 'flex min-h-[50px] w-full items-center gap-3 rounded-[12px] px-3 text-left hover:bg-rail-hover focus:bg-rail-hover focus:outline-none disabled:opacity-50';

export function MenuItem({ onClick, children, disabled = false, danger = false }: {
  onClick: () => void; children: ReactNode; disabled?: boolean; danger?: boolean;
}) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={`${menuRowClass} ${danger ? 'text-danger' : 'text-text'}`}>{children}</button>;
}

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
  // A fixed panel is clamped to the viewport: an anchor near an edge would
  // otherwise push the panel off-screen on a narrow or short window, which is
  // where these menus are most used.
  const gutter = 8;
  const clamp = (value: number, max: number) => Math.max(gutter, Math.min(value, Math.max(gutter, max - gutter)));
  const maxWidth = `calc(100vw - ${gutter * 2}px)`;
  const style: CSSProperties = placement === 'above'
    ? {
        position: 'fixed',
        left: typeof width === 'number' ? clamp(rect.left, window.innerWidth - width) : rect.left,
        bottom: Math.max(gutter, window.innerHeight - rect.top + gutter),
        width, maxWidth,
        maxHeight: Math.max(120, rect.top - gutter * 2),
      }
    : placement === 'below'
      ? {
          position: 'fixed',
          right: Math.max(gutter, window.innerWidth - rect.right),
          top: rect.bottom + gutter,
          width, maxWidth,
          maxHeight: Math.max(120, window.innerHeight - rect.bottom - gutter * 2),
        }
      : {
          position: 'fixed',
          left: clamp(rect.left + rect.width + gutter, window.innerWidth - (typeof width === 'number' ? width : 0)),
          bottom: Math.max(gutter, window.innerHeight - rect.bottom),
          width, maxWidth,
          maxHeight: Math.max(120, window.innerHeight - gutter * 2),
        };
  return <div ref={menuRef} role="menu" aria-label={label} style={style} className="z-50 overflow-y-auto rounded-[16px] border border-popover-border bg-popover p-2 font-sans leading-5 shadow-[0_12px_40px_rgba(0,0,0,0.28)]">{children}</div>;
}
