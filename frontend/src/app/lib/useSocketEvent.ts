'use client';

import { useEffect, useRef } from 'react';
import { type SocketEvent } from '../api/social';

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
