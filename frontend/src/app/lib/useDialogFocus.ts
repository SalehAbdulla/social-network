'use client';

import { useEffect, useRef, type RefObject } from 'react';

// Everything a dialog may contain that a keyboard can reach. `[tabindex]` covers
// custom controls; `:not(:disabled)` and the visibility filter below keep
// hidden or inert controls out of the cycle.
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

/**
 * The keyboard contract the mobile navigation drawer already had, packaged for
 * every dialog: on open focus moves inside (to `initialFocus` when given, else
 * the first control), Tab and Shift+Tab cycle within the dialog, Escape closes
 * it, the page behind is frozen and focus returns to whatever had it before.
 *
 * `onClose` is read through a ref, so a caller can pass an inline arrow without
 * re-running the effect — which would re-focus and re-lock on every render.
 *
 * Set `enabled: false` while a dialog is closed but its state still lives in the
 * parent (an inline confirmation), so the trap is only installed when there is
 * something to trap. `lockScroll: false` suits a prompt that is part of the page
 * rather than an overlay.
 */
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
