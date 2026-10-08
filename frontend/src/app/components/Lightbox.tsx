'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { mediaVariant } from '../lib/mediaVariants';

export default function Lightbox({ images, startIndex, label, onClose }: {
  images: string[];
  startIndex: number;
  label: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const touchStart = useRef<number | null>(null);
  const total = images.length;
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
    {many && <p role="status" className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white">{index + 1} of {total}</p>}
  </div>;
}
