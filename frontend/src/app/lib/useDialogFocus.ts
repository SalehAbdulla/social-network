'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

export function useDialogFocus<T extends HTMLElement>(onClose: () => void, options: {
  initialFocus?: RefObject<HTMLElement | null>;
  enabled?: boolean;
  lockScroll?: boolean;
} = {}) {
  const dialog = useRef<T>(null);
  const close = useRef(onClose);
  const { initialFocus, enabled = true, lockScroll = true } = options;
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!enabled) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    const controls = () => [...(dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])].filter(element => element.getClientRects().length > 0);
    (initialFocus?.current ?? controls()[0] ?? dialog.current)?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return; }
      if (event.key !== 'Tab') return;
      const items = controls();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      if (lockScroll) document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyboard);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [initialFocus, enabled, lockScroll]);
  return dialog;
}
