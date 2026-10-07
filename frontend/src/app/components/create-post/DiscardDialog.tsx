'use client';

import { useEffect, useRef } from 'react';

/**
 * The "Discard post?" confirmation, shown over the dialog when there is unsaved content.
 *
 * It is presentational: the shell owns the state and answers Escape (the confirm closes first), so
 * this only draws the scrim and the card and puts focus on Cancel — the non-destructive choice —
 * when it appears.
 */
export default function DiscardDialog({ onDiscard, onCancel }: { onDiscard: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return <>
    <div className="cp-confirm-scrim" aria-hidden="true" onClick={onCancel} />
    <div className="cp-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cp-discard-title" aria-describedby="cp-discard-text">
      <div className="cp-confirm-body">
        <p id="cp-discard-title" className="cp-confirm-title">Discard post?</p>
        <p id="cp-discard-text" className="cp-confirm-text">If you leave, your edits won&apos;t be saved.</p>
      </div>
      <button type="button" className="cp-confirm-row" data-tone="danger" onClick={onDiscard}>Discard</button>
      <button ref={cancelRef} type="button" className="cp-confirm-row" onClick={onCancel}>Cancel</button>
    </div>
  </>;
}
