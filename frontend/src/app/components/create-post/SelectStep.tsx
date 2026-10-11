'use client';

import { Images } from 'lucide-react';
import Button from '../ui/Button';

export default function SelectStep({ onPick, onTextPost, helper, pickRef }: {
  onPick: () => void;
  onTextPost: () => void;
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
      <Button ref={pickRef} variant="primary" onClick={onPick}>Select from computer</Button>
      <p className="cp-or" aria-hidden="true">or</p>
      <Button variant="ghost" onClick={onTextPost}>Write a text post</Button>
    </div>
  </div>;
}
