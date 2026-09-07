'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import SideBar from './SideBar';
import Loading from './Loading';

const PUBLIC_PATHS = ['/login'];

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
    const [isSideBarOpen, setSideBarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();

  // Public pages (like /login) — render without sidebar or auth checks
  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }




  // Signed in on a protected route — show full layout with sidebar
  return (
    <>
      <SideBar
        isSideBarOpen={isSideBarOpen}
        setSideBarOpen={setSideBarOpen}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />
      <main className="flex-1 bg-slate-50">{children}</main>

      <button 
        onClick={() => setSideBarOpen(!isSideBarOpen)}
        aria-label="Toggle Sidebar"
      >
        {isSideBarOpen ? 
            <X 
                className="absolute top-3 right-3 p-2 z-100 bg-white rounded-md shadow w-10 h-10 text-gray-600 sm:hidden" 
                onClick={() => setSideBarOpen(false)}
            />
        :
            <Menu 
                className='absolute top-3 right-3 p-2 z-100 bg-white rounded-md shadow w-10 h-10 text-gray-600 sm:hidden'
                onClick={() => setSideBarOpen(true)}
            />
        }
      </button>
    </>
  );
}

// Separate component to handle client-side redirect
function RedirectToLogin() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return <Loading />;
}