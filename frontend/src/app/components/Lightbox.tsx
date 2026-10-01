'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { mediaVariant } from '../lib/mediaVariants';

/**
 * A full-screen viewer for one post's or comment's photos.
 *
 * It replaces opening the raw file in a new tab. The picture is drawn from the
 * large derivative on purpose — `mediaVariant` names this as the caller that wants
 * one particular size rather than a choice, so the viewer is where the whole thing
 * belongs — and the browser falls back to the original for an upload with no such
 * file, exactly as the grid does.
 *
 * The arrows and the arrow keys move through the set and wrap around, Escape and a
 * click on the backdrop close it, and a horizontal swipe does the same on touch.
 * It is a dialog rather than a div: it names itself, takes focus while it is open,
 * traps Tab, locks the page behind it, and hands focus back to the control that
 * opened it, which is the part a viewer usually forgets.
 */
export default function Lightbox({ images, startIndex, label, onClose }: {
  images: string[];
  startIndex: number;
  /** Names the set for assistive technology, e.g. "Post photos". */
  label: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const dialog = useRef<HTMLDivElement>(null);
  // The element that had focus before this opened; focus goes back to it on close.
  const opener = useRef<Element | null>(null);
  const touchStart = useRef<number | null>(null);
  const total = images.length;
  // A single picture has nowhere to move to, so the controls and the counter stay
  // away rather than being drawn disabled.
  const many = total > 1;

  const step = useCallback((delta: number) => {
    setIndex(current => (current + delta + total) % total);
  }, [total]);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus();
    };
  }, []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); return; }
      if (event.key !== 'Tab') return;
      // Tab is kept inside the dialog, so the page behind it stays unreachable.
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') || [])];
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [onClose, step]);

  const control = 'flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20';

  return <div
    ref={dialog}
    role="dialog"
    aria-modal="true"
    aria-label={`${label} viewer`}
    tabIndex={-1}
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 outline-none backdrop-blur-sm"
    onClick={onClose}
    onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
    onTouchEnd={event => {
      const start = touchStart.current;
      touchStart.current = null;
      if (start === null || !many) return;
      const delta = (event.changedTouches[0]?.clientX ?? start) - start;
      if (Math.abs(delta) > 40) step(delta < 0 ? 1 : -1);
    }}
  >
    <button type="button" aria-label="Close image viewer" onClick={onClose} className={`absolute right-4 top-4 ${control}`}><X size={22} /></button>
    {many && <button type="button" aria-label="Previous image" onClick={event => { event.stopPropagation(); step(-1); }} className={`absolute left-3 ${control}`}><ChevronLeft size={24} /></button>}
    <img
      src={mediaVariant(images[index], 'large')}
      alt={`${label} ${index + 1} of ${total}`}
      onClick={event => event.stopPropagation()}
      className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
    />
    {many && <button type="button" aria-label="Next image" onClick={event => { event.stopPropagation(); step(1); }} className={`absolute right-3 ${control}`}><ChevronRight size={24} /></button>}
    {many && <p role="status" className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">{index + 1} of {total}</p>}
  </div>;
}
