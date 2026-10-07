'use client';

import { CircleAlert } from 'lucide-react';

/** The three states a share can be in once the reader has committed, `editing` excluded. */
export type SharePhase = 'sharing' | 'success' | 'error';

/**
 * The sharing, success and failure panel that stands in for the whole dialog body.
 *
 * The success mark is a circled check whose stroke draws itself (250ms), reduced to an instant
 * stroke under `prefers-reduced-motion`. The failure state keeps the server's own message when
 * there is one and offers the two ways out; nothing typed is lost because the shell keeps the draft
 * while it is on screen. The live region announces each state change.
 */
export default function ShareStatus({ phase, message, onRetry, onBack, onDone }: {
  phase: SharePhase;
  /** The server's message for the error state, or a generic one. */
  message: string;
  onRetry: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  return <div className="cp-status" data-error={phase === 'error'} onClick={phase === 'success' ? onDone : undefined}>
    {phase === 'sharing' && <svg className="cp-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="42" strokeDashoffset="14" strokeLinecap="round" /></svg>}
    {phase === 'success' && <svg className="cp-status-icon" viewBox="0 0 64 64" aria-hidden="true">
      <circle className="cp-check-circle" cx="32" cy="32" r="30" />
      <path className="cp-check-mark" d="M20 33.5 L28.5 42 L45 22" />
    </svg>}
    {phase === 'error' && <CircleAlert className="cp-status-icon" aria-hidden="true" />}

    <p className="cp-status-title">{phase === 'sharing' ? 'Sharing' : phase === 'success' ? 'Your post has been shared.' : "Couldn't share your post."}</p>
    {phase === 'error' && <p className="cp-status-text">{message || 'Check your connection and try again.'}</p>}

    <span className="sr-only" role="status" aria-live="polite">{phase === 'sharing' ? 'Sharing your post' : phase === 'success' ? 'Your post has been shared.' : `Couldn't share your post. ${message}`}</span>

    {phase === 'error' && <div className="cp-status-actions">
      <button type="button" className="cp-link" onClick={onRetry}>Try again</button>
      <button type="button" className="cp-link" onClick={onBack}>Back to edit</button>
    </div>}
  </div>;
}
