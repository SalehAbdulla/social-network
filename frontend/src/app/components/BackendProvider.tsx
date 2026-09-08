'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { devUserEnabled, errorMessage, request, type SocialUser, type SocketEvent } from '../api/social';
import Loading from './Loading';

interface Session {
  user: SocialUser;
  refreshUser: () => Promise<void>;
  switchUser: (email: string) => Promise<void>;
  connected: boolean;
  devEmail: string;
  sendEvent: (event: SocketEvent) => void;
}
const Context = createContext<Session | null>(null);

export function useBackend() {
  const value = useContext(Context);
  if (!value) throw new Error('BackendProvider is required');
  return value;
}

export default function BackendProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SocialUser | null>(null);
  const [error, setError] = useState('');
  const [devEmail, setDevEmail] = useState('dummy@example.com');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const sessionRevision = useRef(0);

  const initialize = useCallback(async () => {
    const revision = ++sessionRevision.current;
    setError('');
    setUser(null);
    setSocket(null);
    try {
      const email = localStorage.getItem('social:dev-user') || 'dummy@example.com';
      const profile = devUserEnabled
        ? await request<SocialUser>('/dev/session', 'POST', { email })
        : await request<SocialUser>('/users/me');
      if (revision !== sessionRevision.current) return;
      setUser(profile);
      setDevEmail(email);
    } catch (error) {
      if (revision !== sessionRevision.current) return;
      setError(devUserEnabled && axios.isAxiosError(error) && error.response?.status === 404
        ? 'Start the backend with backend/dev.cmd to enable the demo users, then reconnect.'
        : errorMessage(error));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void initialize(); }, 0);
    const expired = () => { setSocket(null); setError('Your backend session expired. Reconnect to continue.'); };
    window.addEventListener('social:session-expired', expired);
    return () => { sessionRevision.current++; clearTimeout(timer); window.removeEventListener('social:session-expired', expired); };
  }, [initialize]);

  const userId = user?.userId;
  useEffect(() => {
    if (!userId || error) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let current: WebSocket;
    const connect = () => {
      current = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      current.onopen = () => {
        if (stopped) { current.close(); return; }
        setSocket(current);
        window.dispatchEvent(new CustomEvent('social:socket', { detail: { type: 'connected', payload: {} } }));
      };
      current.onmessage = ({ data }) => {
        if (stopped) return;
        for (const line of String(data).split('\n')) {
          try { window.dispatchEvent(new CustomEvent<SocketEvent>('social:socket', { detail: JSON.parse(line) })); }
          catch { /* Ignore malformed frames without losing the connection. */ }
        }
      };
      current.onerror = () => current.close();
      current.onclose = () => {
        if (stopped) return;
        setSocket(null);
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); current.close(); };
  }, [userId, error]);

  const refreshUser = useCallback(async () => {
    const revision = sessionRevision.current;
    const profile = await request<SocialUser>('/users/me');
    if (revision === sessionRevision.current) setUser(profile);
  }, []);
  const switchUser = useCallback(async (email: string) => {
    const revision = ++sessionRevision.current;
    const profile = await request<SocialUser>('/dev/session', 'POST', { email });
    if (revision !== sessionRevision.current) return;
    localStorage.setItem('social:dev-user', email);
    setDevEmail(email);
    if (profile.userId !== user?.userId) setSocket(null);
    setError('');
    setUser(profile);
  }, [user?.userId]);
  const sendEvent = useCallback((event: SocketEvent) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }, [socket]);

  useEffect(() => {
    const listener = (event: Event) => {
      if (['social_changed', 'connected'].includes((event as CustomEvent<SocketEvent>).detail.type)) {
        void refreshUser().catch(error => setError(errorMessage(error)));
      }
    };
    window.addEventListener('social:socket', listener);
    return () => window.removeEventListener('social:socket', listener);
  }, [refreshUser]);

  if (error) return <div className="m-auto max-w-lg p-8 text-center space-y-4" role="alert">
    <h1 className="text-xl font-semibold">Couldn&apos;t connect</h1><p>{error}</p>
    <button className="rounded-lg bg-blue-600 px-5 py-2 text-white" onClick={() => void initialize()}>Reconnect</button>
  </div>;
  if (!user) return <Loading />;
  return <Context.Provider value={{ user, refreshUser, switchUser, connected: socket?.readyState === WebSocket.OPEN, devEmail, sendEvent }}><div key={user.userId} className="flex h-full min-h-screen w-full min-w-0">{children}</div></Context.Provider>;
}
