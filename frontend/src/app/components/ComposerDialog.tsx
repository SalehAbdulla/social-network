'use client';

import { X } from 'lucide-react';
import { useDialogFocus } from '../lib/useDialogFocus';
import PostForm from './PostForm';

/**
 * The Instagram composer: the same `PostForm` the `/create-post` deep link renders, in a
 * dialog over whatever page asked for it. A bottom sheet on a phone and a centred card from
 * `sm` up — the shape Instagram uses, and the reason the form is told `variant="modal"`:
 * inside here it drops the wide two-column page layout and keeps its own scroll.
 *
 * The backdrop is a sibling of the panel rather than its parent, because `backdrop-filter`
 * makes an element the containing block of a `position: fixed` descendant and a wrapping
 * backdrop would anchor the sheet to itself — the same reasoning as the comment sheet. The
 * keyboard contract is `useDialogFocus`: focus moves in, Tab cycles, Escape closes, the page
 * behind freezes, and focus returns to the button that opened it.
 */
export default function ComposerDialog({ onClose }: { onClose: () => void }) {
  const dialog = useDialogFocus<HTMLDivElement>(onClose);
  return <>
    <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm" />
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Create a post" className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(42rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">Create a post</h2>
        <button type="button" aria-label="Close composer" onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2"><X size={18} /></button>
      </div>
      <PostForm variant="modal" onPublished={onClose} />
    </div>
  </>;
}
