'use client';
import { useEffect } from 'react';
import { type SocketEvent } from '../api/social';

export function useLiveRefresh(reload: () => void, groupId?: string) {
  useEffect(() => {
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (scheduled) return;
      scheduled = setTimeout(() => { scheduled = undefined; reload(); }, 350);
    };
    const listener = (event: Event) => {
      const message = (event as CustomEvent<SocketEvent>).detail;
      if (message.type === 'connected' || (groupId ? message.type === 'group_changed' && String(message.payload.groupId) === groupId : ['message_changed', 'incoming_msg', 'read_receipt', 'user_status', 'user_offline', 'group_changed', 'social_changed', 'notification', 'notification_changed'].includes(message.type))) refresh();
    };
    window.addEventListener('social:socket', listener);
    const poll = setInterval(refresh, 15000);
    return () => { clearInterval(poll); clearTimeout(scheduled); window.removeEventListener('social:socket', listener); };
  }, [reload, groupId]);
}
