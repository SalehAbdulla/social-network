'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ClerkProvider, useUser } from '@clerk/nextjs';
import { Menu, X } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { devUserEnabled } from '../api/social';
import BackendProvider from './BackendProvider';
import SideBar from './SideBar';
import Loading from './Loading';

function ClerkGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  useEffect(() => { if (isLoaded && !isSignedIn) router.replace('/login'); }, [isLoaded, isSignedIn, router]);
  return isLoaded && isSignedIn ? children : <Loading />;
}
function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <>
    <SideBar isSideBarOpen={open} setSideBarOpen={setOpen} isCollapsed={collapsed} setIsCollapsed={setCollapsed} />
    <main className="min-w-0 flex-1 bg-slate-50 h-screen overflow-y-auto">{children}</main>
    <button aria-label="Toggle sidebar" onClick={() => setOpen(!open)} className="fixed right-3 top-3 z-40 rounded-lg bg-white p-2 shadow sm:hidden">{open ? <X /> : <Menu />}</button>
  </>;
}
export default function ClientLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const app = <BackendProvider><Shell>{children}</Shell></BackendProvider>;
  return <><Toaster position="top-center" />{pathname === '/login' ? <ClerkProvider>{children}</ClerkProvider> : devUserEnabled ? app : <ClerkProvider><ClerkGate>{app}</ClerkGate></ClerkProvider>}</>;
}
