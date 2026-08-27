import React from 'react'
import { menuItemsData } from '../../../public/assets'
import { useRouter, usePathname } from 'next/navigation';


interface MainMenuProps {
  setSideBarOpen: (open: boolean) => void
}

const MenuItems = ({ setSideBarOpen }: MainMenuProps) => {
    const router = useRouter();
    const pathname = usePathname();
  
  return (
    <div className='px-6 text-gray-600 space-y-1 font-medium'>
      {
        menuItemsData.map(({to, label, Icon}) => {
          const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);
          return <div key={to}>
            <button onClick={() => {
              router.push(to);
              setSideBarOpen(false);
            }} className={`px-3.5 py-2 flex items-center gap-3 rounded-xl ${isActive ? 'bg-blue-100 text-brand-deep': 'hover:bg-gray-50'}`}>
              <Icon className='h-5 w-5'/>
              {label}
            </button>
          </div>
          })
      }
    </div>
        
  )
}

export default MenuItems