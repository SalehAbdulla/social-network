'use client';

import toast from 'react-hot-toast';

/**
 * Surface a request error as a toast instead of an inline error block.
 *
 * When `retry` is provided the toast renders a "Try again" action so a failed
 * request can be re-issued without keeping error UI on the page. Identical
 * messages reuse the same toast id, so repeated failures (polling, reloads,
 * several resources failing together) update one toast instead of stacking up.
 */
export function notifyError(message: string, retry?: () => void) {
  if (!message) return;
  toast.error(
    (notification) => (
      <span className="flex flex-col gap-2">
        <span>{message}</span>
        {retry && (
          <button
            type="button"
            className="self-start text-xs font-semibold underline"
            onClick={() => {
              toast.dismiss(notification.id);
              retry();
            }}
          >
            Try again
          </button>
        )}
      </span>
    ),
    { id: message, duration: retry ? 8000 : 5000 },
  );
}