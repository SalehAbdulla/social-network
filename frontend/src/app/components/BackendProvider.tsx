'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  const initialize = useCallback(async () => {
    setError('');
    try {
      const email = localStorage.getItem('social:dev-user') || 'dummy@example.com';
      const profile = devUserEnabled
        ? await request<SocialUser>('/dev/session', 'POST', { email })
        : await request<SocialUser>('/users/me');
      setUser(profile);
      setDevEmail(email);
    } catch (error) { setError(errorMessage(error)); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void initialize(); }, 0);
    const expired = () => setError('Your backend session expired. Reconnect to continue.');
    window.addEventListener('social:session-expired', expired);
    return () => { clearTimeout(timer); window.removeEventListener('social:session-expired', expired); };
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
        setSocket(current); setConnected(true);
        window.dispatchEvent(new CustomEvent('social:socket', { detail: { type: 'connected', payload: {} } }));
      };
      current.onmessage = ({ data }) => {
        for (const line of String(data).split('\n')) {
          try { window.dispatchEvent(new CustomEvent<SocketEvent>('social:socket', { detail: JSON.parse(line) })); }
          catch { /* Ignore malformed frames without losing the connection. */ }
        }
      };
      current.onerror = () => current.close();
      current.onclose = () => {
        if (stopped) return;
        setConnected(false); setSocket(null);
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); current.close(); };
  }, [userId, error]);

  const refreshUser = useCallback(async () => { setUser(await request<SocialUser>('/users/me')); }, []);
  const switchUser = useCallback(async (email: string) => {
    const profile = await request<SocialUser>('/dev/session', 'POST', { email });
    localStorage.setItem('social:dev-user', email);
    setDevEmail(email);
    setUser(profile);
  }, []);

  if (error) return <div className="m-auto max-w-lg p-8 text-center space-y-4" role="alert">
    <h1 className="text-xl font-semibold">Couldn&apos;t connect</h1><p>{error}</p>
    <button className="rounded-lg bg-blue-600 px-5 py-2 text-white" onClick={() => void initialize()}>Reconnect</button>
  </div>;
  if (!user) return <Loading />;
  return <Context.Provider value={{ user, refreshUser, switchUser, connected, devEmail, sendEvent: event => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  } }}><div key={user.userId} className="flex h-full min-h-screen w-full min-w-0">{children}</div></Context.Provider>;
}
