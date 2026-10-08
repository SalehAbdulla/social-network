'use client';

import toast from 'react-hot-toast';

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