"use client"

import { useRouter } from 'next/navigation';
import {assets, menuItemsData} from '../../../public/assets';
import MenuItems from './MenuItems';
import { CirclePlus, LogOut } from 'lucide-react';
import {useClerk, useUser, UserButton } from '@clerk/nextjs';

interface SideBarProps {
  isSideBarOpen: boolean
  setSideBarOpen: (open: boolean) => void
}

const Sidebar = ({isSideBarOpen, setSideBarOpen}: SideBarProps) => {

  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();

  const displayName = user?.fullName || user?.username || 'User';
  const displayUsername = user?.username ? `@${user.username}` : '';

  return <div className={`w-60 xl:w-72 bg-white border-r border-gray-200 flex flex-col justify-between items-center max-sm:absolute top-0 z-20
  ${isSideBarOpen ? 'translate-x-0' : 'max-sm:-translate-x-full'} transition-all duration-300 ease-in-out`}>
    <div className='flex flex-col w-full'>
      <img onClick={() => router.push('/')} src={assets.logo.src} alt="" className='w-40 ml-7 my-2 cursor-pointer' />
      <hr className='border-gray-300 mb-8'/>
      <MenuItems setSideBarOpen={setSideBarOpen} />


      <button className='mx-3 flex items-center justify-center gap-2 py-2.5 mt-6 rounded-lg bg-linear-to-r from-brand-1 to-brand-2 hover:from-blue-400 hover:to-blue-800-to-r active:scale-95 transition text-white cursor-pointer px-5'>
        <CirclePlus onClick={() => router.push('/create-post')} className='w-5 h-5'/>
        Create Post
      </button>

    </div>
        <div className='w-full border-t border-gray-200 p-4 px-7 flex items-center justify-between'>
        <div className='flex gap-2 items-center cursor-pointer'>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-9 h-9',
              },
            }}
          />
          <div>
            <h1 className='text-sm font-medium truncate max-w-24'>{displayName}</h1>
            {displayUsername && <p className='text-xs text-gray-500 truncate max-w-24'>{displayUsername}</p>}
          </div>
        </div>
        <LogOut onClick={() => signOut()} className='w-4.5 text-gray-400 hover:text-gray-700' />
      </div>

  </div>

}

export default Sidebar
