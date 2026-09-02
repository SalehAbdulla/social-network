'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import SideBar from './SideBar';
import { dummyUserData } from '../../../public/assets';
import Loading from './Loading';

export default function ClientLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
    const user = dummyUserData // later will get the user from the backend
    const [isSideBarOpen, setSideBarOpen] = useState(false);

  return user ? (
    <>
      <SideBar isSideBarOpen={isSideBarOpen} setSideBarOpen={setSideBarOpen}/>
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
  ) :
    <Loading />
    ;
}