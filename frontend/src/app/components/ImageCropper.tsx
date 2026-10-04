'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '../lib/useDialogFocus';
import { CROP_PRESETS, cropToAspect } from '../lib/crop';

/**
 * The crop step for one chosen photo: a preview of exactly the rectangle the canvas will
 * keep and a row of shape presets. It is the browser's own `object-fit: cover` drawing the
 * preview in a box of the chosen aspect, so what is shown is what `cropToAspect` produces —
 * no second geometry to keep in step.
 *
 * The keyboard contract is `useDialogFocus`, and the backdrop is a sibling of the panel for
 * the reason the comment sheet gives: `backdrop-filter` makes an element the containing block
 * of a `position: fixed` descendant. `Ratio` defaults to the square, which is Instagram's
 * default framing for a new post.
 */
export default function ImageCropper({ file, onApply, onClose }: {
  file: File;
  onApply: (cropped: File) => void;
  onClose: () => void;
}) {
  const dialog = useDialogFocus<HTMLDivElement>(onClose);
  const [preset, setPreset] = useState<typeof CROP_PRESETS[number]>(CROP_PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  // The object URL is created and revoked with the file, the same lifecycle the tile uses —
  // assigned in a task rather than in the effect body, so the effect does not set state
  // synchronously (the rule `ImagePicker.Preview` also sidesteps this way).
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    const timer = setTimeout(() => setUrl(objectUrl), 0);
    return () => { clearTimeout(timer); URL.revokeObjectURL(objectUrl); };
  }, [file]);

  async function apply() {
    setBusy(true);
    try { onApply(await cropToAspect(file, preset.ratio)); } finally { setBusy(false); }
  }

  return <>
    <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm" />
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Crop photo" className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[min(30rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text">Crop photo</h2>
        <button type="button" aria-label="Close crop" onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2"><X size={18} /></button>
      </div>
      <div className="flex justify-center rounded-xl bg-slate-100 p-2">
        {url && (preset.ratio
          ? <img src={url} alt="Crop preview" style={{ aspectRatio: String(preset.ratio) }} className="max-h-72 w-full max-w-full rounded-lg object-cover" />
          : <img src={url} alt="Crop preview" className="max-h-72 w-auto rounded-lg object-contain" />)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Crop shape">
        {CROP_PRESETS.map(option => <button key={option.id} type="button" aria-pressed={preset.id === option.id} onClick={() => setPreset(option)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${preset.id === option.id ? 'border-transparent bg-brand-1 text-white' : 'border-border text-muted hover:bg-surface-2'}`}>{option.label}</button>)}
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted">Cancel</button>
        <button type="button" disabled={busy} onClick={() => void apply()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">Apply crop</button>
      </div>
    </div>
  </>;
}
