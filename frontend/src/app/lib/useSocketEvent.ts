'use client';

import { useEffect, useRef } from 'react';
import { type SocketEvent } from '../api/social';

/**
 * Runs `handler` for every socket frame of `type`.
 *
 * `BackendProvider` already owns the one WebSocket and re-dispatches each frame it
 * receives as a `social:socket` DOM event, so a feature subscribes to that instead of
 * opening a second socket. The handler is read through a ref so an inline arrow does
 * not rebuild the listener on every render; only `type` does. `connected` is a frame
 * like any other, which is how a caller can resync after a reconnect.
 */
export function useSocketEvent(type: SocketEvent['type'], handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; });
  useEffect(() => {
    const listener = (event: Event) => {
      if ((event as CustomEvent<SocketEvent>).detail.type === type) latest.current();
    };
    window.addEventListener('social:socket', listener);
    return () => { window.removeEventListener('social:socket', listener); };
  }, [type]);
}
