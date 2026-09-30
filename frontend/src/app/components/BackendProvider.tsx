'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { errorMessage, isUnauthorized, request, type SocialUser, type SocketEvent } from '../api/social';
import { notifyError } from '../lib/notify';
import Loading from './Loading';
import Sidebar from './SideBar';

interface Session {
  user: SocialUser;
  refreshUser: () => Promise<void>;
  connected: boolean;
  sendEvent: (event: SocketEvent) => void;
}
const Context = createContext<Session | null>(null);

export function useBackend() {
  const value = useContext(Context);
  if (!value) throw new Error('BackendProvider is required');
  return value;
}

// The routes that exist for someone who cannot sign in. They must not be wrapped in
// the authenticated shell: the provider's own `/users/me` would answer 401 and bounce
// them to /login before they could be used, which is the one visitor a reset exists
// for.
const PUBLIC_ROUTES = ['/login', '/forgot', '/reset'];

export default function BackendProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (PUBLIC_ROUTES.includes(pathname)) return <>{children}</>;
  return <AuthenticatedBackend>{children}</AuthenticatedBackend>;
}

function AuthenticatedBackend({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SocialUser | null>(null);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isSideBarOpen, setSideBarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const sessionRevision = useRef(0);

  const redirectToLogin = useCallback(() => {
    sessionRevision.current++;
    setUser(null);
    setSocket(null);
    setError('');
    router.replace('/login');
  }, [router]);

  const initialize = useCallback(async () => {
    const revision = ++sessionRevision.current;
    setError('');
    setUser(null);
    setSocket(null);
    try {
      const profile = await request<SocialUser>('/users/me', 'GET', undefined, undefined, false);
      if (revision !== sessionRevision.current) return;
      setUser(profile);
    } catch (error) {
      if (revision !== sessionRevision.current) return;
      if (isUnauthorized(error)) redirectToLogin();
      else setError(errorMessage(error));
    }
  }, [redirectToLogin]);

  useEffect(() => {
    const timer = setTimeout(() => { void initialize(); }, 0);
    window.addEventListener('social:session-expired', redirectToLogin);
    return () => { sessionRevision.current++; clearTimeout(timer); window.removeEventListener('social:session-expired', redirectToLogin); };
  }, [initialize, redirectToLogin]);

  const userId = user?.userId;
  useEffect(() => {
    if (!userId || error) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let current: WebSocket;
    const connect = () => {
      // Only a connection that had been open can drop, so a cold start does not
      // flash the banner before the first handshake completes.
      let opened = false;
      current = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      current.onopen = () => {
        if (stopped) { current.close(); return; }
        opened = true;
        setReconnecting(false);
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
        if (opened) setReconnecting(true);
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
  const sendEvent = useCallback((event: SocketEvent) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }, [socket]);

  useEffect(() => {
    const listener = (event: Event) => {
      if (['social_changed', 'connected'].includes((event as CustomEvent<SocketEvent>).detail.type)) {
        void refreshUser().catch(error => { if (!isUnauthorized(error)) setError(errorMessage(error)); });
      }
    };
    window.addEventListener('social:socket', listener);
    return () => window.removeEventListener('social:socket', listener);
  }, [refreshUser]);

  // Session failures are reported with a toast instead of inline error UI.
  useEffect(() => {
    if (error) notifyError(error, () => void initialize());
  }, [error, initialize]);

  if (error) return <div className="m-auto max-w-lg p-8 text-center space-y-4">
    <h1 className="text-xl font-semibold">Couldn&apos;t connect</h1>
    <button className="rounded-lg bg-blue-600 px-5 py-2 text-white" onClick={() => void initialize()}>Reconnect</button>
  </div>;
  if (!user) return <Loading />;
  return <Context.Provider value={{ user, refreshUser, connected: socket?.readyState === WebSocket.OPEN, sendEvent }}><div key={user.userId} className="flex min-h-screen w-full min-w-0">
    <Sidebar isSideBarOpen={isSideBarOpen} setSideBarOpen={setSideBarOpen} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
    <main className="relative min-w-0 flex-1">
      <button aria-label="Open navigation" aria-expanded={isSideBarOpen} aria-controls="main-navigation" onClick={() => { setIsCollapsed(false); setSideBarOpen(true); }} className="glass-track fixed left-4 top-4 z-30 rounded-lg p-2 sm:hidden"><Menu size={20} /></button>
      {reconnecting && <p role="status" aria-live="polite" className="sticky top-0 z-20 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">Reconnecting… new messages and notifications may be delayed.</p>}
      {children}
    </main>
  </div></Context.Provider>;
}
