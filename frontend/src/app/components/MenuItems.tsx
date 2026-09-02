import React from 'react'
import { menuItemsData } from '../../../public/assets'
import { useRouter, usePathname } from 'next/navigation';


interface MainMenuProps {
  setSideBarOpen: (open: boolean) => void
  showLabels?: boolean
}

const MenuItems = ({ setSideBarOpen, showLabels = true }: MainMenuProps) => {
    const router = useRouter();
    const pathname = usePathname();
  
  return (
    <div className={`text-gray-600 space-y-1 font-medium ${showLabels ? 'px-6' : 'px-3 flex flex-col items-center'}`}>
      {
        menuItemsData.map(({to, label, Icon}) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return <div key={to} className={showLabels ? '' : 'w-full flex justify-center'}>
            <button onClick={() => {
              router.push(to);
              setSideBarOpen(false);
            }} className={`${showLabels ? 'px-3.5 py-2 flex items-center gap-3 rounded-xl w-full' : 'p-2.5 rounded-xl flex items-center justify-center w-10 h-10'} ${isActive ? 'bg-blue-100 text-brand-deep': 'hover:bg-gray-50'}`}>
              <Icon className='h-5 w-5 shrink-0'/>
              {showLabels && label}
            </button>
          </div>
          })
      }
    </div>
        
  )
}

export default MenuItems