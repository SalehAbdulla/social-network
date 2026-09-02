"use client"

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {assets} from '../../../public/assets';
import MenuItems from './MenuItems';
import { CirclePlus, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import {useClerk, useUser, UserButton } from '@clerk/nextjs';

interface SideBarProps {
  isSideBarOpen: boolean
  setSideBarOpen: (open: boolean) => void
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
}

const Sidebar = ({isSideBarOpen, setSideBarOpen, isCollapsed, setIsCollapsed}: SideBarProps) => {

  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isHovered, setIsHovered] = useState(false);

  // When collapsed and hovered, temporarily show expanded layout
  const effectiveExpanded = !isCollapsed || isHovered;
  const displayName = user?.fullName || user?.username || 'User';
  const displayUsername = user?.username ? `@${user.username}` : '';

  return (
    <div
      onMouseEnter={() => isCollapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        bg-white border-r border-gray-200 flex flex-col justify-between items-center
        max-sm:absolute top-0 bottom-0 z-20
        ${isSideBarOpen ? 'translate-x-0' : 'max-sm:-translate-x-full'}
        transition-all duration-300 ease-in-out
        ${effectiveExpanded
          ? 'w-60 xl:w-72'
          : 'w-20'
        }
        ${isCollapsed && isHovered
          ? 'absolute shadow-2xl z-30 h-full'
          : 'relative'
        }
      `}
    >
      {/* ─── Top section ─── */}
      <div className={`flex flex-col ${effectiveExpanded ? 'w-full' : 'w-full items-center'}`}>
        {/* Logo */}
        {effectiveExpanded ? (
          <img
            onClick={() => router.push('/')}
            src={assets.logo.src}
            alt=""
            className="w-40 ml-7 my-2 cursor-pointer"
          />
        ) : (
          <div
            onClick={() => router.push('/')}
            className="w-full flex justify-center py-4 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-brand-1 to-brand-2 flex items-center justify-center text-white font-bold text-sm">
              S
            </div>
          </div>
        )}
        <hr className='border-gray-300 mb-8' />

        {/* Menu items */}
        <MenuItems
          setSideBarOpen={setSideBarOpen}
          showLabels={effectiveExpanded}
        />

        {/* Create Post button */}
        <button
          onClick={() => router.push('/create-post')}
          className={`
            mt-6 rounded-lg bg-linear-to-r from-brand-1 to-brand-2
            hover:from-blue-400 hover:to-blue-800-to-r
            active:scale-95 transition text-white cursor-pointer
            ${effectiveExpanded
              ? 'mx-3 flex items-center justify-center gap-2 py-2.5 px-5'
              : 'mx-auto flex items-center justify-center p-2.5'
            }
          `}
        >
          <CirclePlus className='w-5 h-5 shrink-0' />
          {effectiveExpanded && 'Create Post'}
        </button>
      </div>

      {/* ─── Bottom section ─── */}
      <div className={`w-full border-t border-gray-200 ${effectiveExpanded ? 'p-4 px-7' : 'py-4'} flex items-center ${effectiveExpanded ? 'justify-between' : 'flex-col gap-3'}`}>
        <div className={`flex items-center cursor-pointer ${effectiveExpanded ? 'gap-2' : 'flex-col gap-1'}`}>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-9 h-9 shrink-0',
              },
            }}
          />
          {effectiveExpanded && (
            <div>
              <h1 className='text-sm font-medium truncate max-w-24'>{displayName}</h1>
              {displayUsername && <p className='text-xs text-gray-500 truncate max-w-24'>{displayUsername}</p>}
            </div>
          )}
        </div>

        <LogOut onClick={() => signOut()} className='w-4.5 text-gray-400 hover:text-gray-700 shrink-0 cursor-pointer' />
      </div>

      {/* ─── Collapse toggle button ─── */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`
          absolute -right-3 top-1/2 -translate-y-1/2
          w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm
          flex items-center justify-center
          text-gray-400 hover:text-gray-700 hover:shadow-md
          transition-all duration-200
          max-sm:hidden
          cursor-pointer
        `}
      >
        {isCollapsed ? (
          <ChevronRight className='w-3.5 h-3.5' />
        ) : (
          <ChevronLeft className='w-3.5 h-3.5' />
        )}
      </button>
    </div>
  )
}

export default Sidebar
