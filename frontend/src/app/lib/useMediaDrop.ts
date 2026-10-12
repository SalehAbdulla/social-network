'use client';

import { useState, type DragEvent } from 'react';

// The mechanics of "drop files here": whether a drag is carrying files at all, whether the pointer
// is still inside the zone, and swallowing the drop so the browser never leaves the page for the
// file it was handed. What the files mean is the caller's business, so the composer and the
// conversation it sits in share one implementation instead of each watching the pointer itself.
export function useMediaDrop({ enabled = true, onFiles }: {
  enabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [dropping, setDropping] = useState(false);
  // A drag of text, a link or a selected element carries no files: those drops keep the browser's
  // own behaviour and never light up the zone.
  const carryingFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes('Files');

  return {
    dropping: dropping && enabled,
    dropProps: {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!enabled || !carryingFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        const to = event.relatedTarget as Node | null;
        if (!to || !event.currentTarget.contains(to)) setDropping(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setDropping(false);
        if (!enabled || !carryingFiles(event)) return;
        event.preventDefault();
        onFiles(Array.from(event.dataTransfer.files));
      },
    },
  };
}
