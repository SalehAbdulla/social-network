'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { errorMessage, isUnauthorized, request, savedAccounts, type SavedAccount, type SocialUser, type SocketEvent } from '../api/social';
import { notifyError } from '../lib/notify';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import Loading from './Loading';
import Sidebar from './SideBar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import MessagesDock from './MessagesDock';
import SwitchAccounts from './SwitchAccounts';

interface Session {
  user: SocialUser;
  refreshUser: () => Promise<void>;
  connected: boolean;
  sendEvent: (event: SocketEvent) => void;
  badges: { notifications: number; messages: number } | null;
  accounts: SavedAccount[];
  refreshAccounts: () => Promise<void>;
}
const Context = createContext<Session | null>(null);

export function useBackend() {
  const value = useContext(Context);
  if (!value) throw new Error('BackendProvider is required');
  return value;
}

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
  const [reconnecting, setReconnecting] = useState(false);
  const [badges, setBadges] = useState<{ notifications: number; messages: number } | null>(null);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);
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
          catch { /* skip a malformed frame */ }
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

  const refreshAccounts = useCallback(async () => {
    try {
      const saved = await savedAccounts();
      setAccounts(saved.accounts);
    } catch { /* the switcher just stays empty */ }
  }, []);
  useEffect(() => {
    if (!userId) { setAccounts([]); return; }
    void refreshAccounts();
  }, [userId, refreshAccounts]);
  useEffect(() => {
    const open = () => setSwitcherOpen(true);
    window.addEventListener('social:switch-accounts', open);
    return () => window.removeEventListener('social:switch-accounts', open);
  }, []);

  const [badgeRevision, setBadgeRevision] = useState(0);
  const reloadBadges = useCallback(() => setBadgeRevision(value => value + 1), []);
  useEffect(() => {
    if (!userId) return;
    const abort = new AbortController();
    request<{ notifications: number; messages: number }>('/notifications/unread-counts', 'GET', undefined, abort.signal)
      .then(counts => { if (!abort.signal.aborted) setBadges(counts); })
      .catch(() => { /* keep the last counts */ });
    return () => abort.abort();
  }, [userId, badgeRevision]);
  useLiveRefresh(reloadBadges);
  useEffect(() => {
    window.addEventListener('social:notifications', reloadBadges);
    return () => window.removeEventListener('social:notifications', reloadBadges);
  }, [reloadBadges]);

  useEffect(() => {
    const listener = (event: Event) => {
      if (['social_changed', 'connected'].includes((event as CustomEvent<SocketEvent>).detail.type)) {
        void refreshUser().catch(error => { if (!isUnauthorized(error)) setError(errorMessage(error)); });
      }
    };
    window.addEventListener('social:socket', listener);
    return () => window.removeEventListener('social:socket', listener);
  }, [refreshUser]);

  useEffect(() => {
    if (error) notifyError(error, () => void initialize());
  }, [error, initialize]);

  if (error) return <div className="m-auto max-w-lg p-8 text-center space-y-4">
    <h1 className="text-xl font-semibold">Couldn&apos;t connect</h1>
    <button className="rounded-lg bg-blue-600 px-5 py-2 text-white" onClick={() => void initialize()}>Reconnect</button>
  </div>;
  if (!user) return <Loading />;
  return <Context.Provider value={{ user, refreshUser, connected: socket?.readyState === WebSocket.OPEN, sendEvent, badges, accounts, refreshAccounts }}><div key={user.userId} className="flex min-h-screen w-full min-w-0">
    <Sidebar />
    <div className="app-content flex min-w-0 flex-1 flex-col">
      <TopBar />
      <main className="relative min-w-0 flex-1 pb-[calc(56px_+_env(safe-area-inset-bottom))] md:pb-0">
        {reconnecting && <p role="status" aria-live="polite" className="sticky top-0 z-20 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">Reconnecting… new messages and notifications may be delayed.</p>}
        {children}
      </main>
      <BottomNav />
      <Suspense fallback={null}><MessagesDock /></Suspense>
    </div>
    <SwitchAccounts open={switcherOpen} onClose={() => setSwitcherOpen(false)} accounts={accounts} activeUserId={user.userId} refreshAccounts={refreshAccounts} />
  </div></Context.Provider>;
}
