'use client';

import { Images } from 'lucide-react';
import Button from '../ui/Button';

/**
 * Step 1: the invitation to add photos.
 *
 * A dashed drop zone is the hero, and the whole of it is a button — clicking it, or pressing Enter
 * or Space on it, opens the file picker, the same action the primary below performs, so the
 * invitation reads as somewhere to drop *and* to press rather than as decoration. Below it sit the
 * two ways in are plain text actions, centred and split by an "or" — no fills, just labels: the
 * accent-coloured one opens the file picker, the neutral one jumps straight to the text-only details
 * step, a feature this app has and Instagram does not. Both draw the shared `ui-btn` geometry — the
 * 32px height, the 14px/600 label, `nowrap` — so they read as the same controls the app draws.
 */
export default function SelectStep({ onPick, onTextPost, helper, pickRef }: {
  onPick: () => void;
  onTextPost: () => void;
  /** The red 12px line a refused file earns, empty when nothing was refused. */
  helper: string;
  pickRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return <div className="cp-select">
    <div
      className="cp-dropzone"
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(); } }}
    >
      <span className="cp-select-icon" aria-hidden="true"><Images /></span>
      <div className="cp-select-copy">
        <p className="cp-select-title">Drag photos here</p>
        <p className="cp-select-hint">JPEG, PNG, GIF or WebP up to 10 MB</p>
      </div>
      {helper && <p className="cp-select-helper" role="alert">{helper}</p>}
    </div>
    <div className="cp-select-actions">
      <Button className="bg-black" ref={pickRef} variant="text" onClick={onPick}>computer</Button>
      <p className="cp-or" aria-hidden="true">or</p>
      <Button className='bg-black' variant="ghost" onClick={onTextPost}>text post</Button>
    </div>
  </div>;
}
