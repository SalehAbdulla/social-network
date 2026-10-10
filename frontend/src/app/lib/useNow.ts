'use client';

import { useEffect, useState } from 'react';

/**
 * A clock that ticks, so a relative timestamp ("5m", "2h") stays honest on its
 * own. Without it the label is computed once at render and only changes when
 * something else re-renders the row — which made post times look frozen until
 * the user voted, since that was the next re-render.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
