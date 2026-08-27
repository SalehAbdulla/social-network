"use client"

import { useRouter } from 'next/navigation';
import {assets, menuItemsData} from '../../../public/assets';
import MenuItems from './MenuItems';

interface SideBarProps {
  isSideBarOpen: boolean
  setSideBarOpen: (open: boolean) => void
}

const Sidebar = ({isSideBarOpen, setSideBarOpen}: SideBarProps) => {

  const router = useRouter();

  return <div className={`w-60 xl:w-72 bg-white border-r border-gray-200 flex flex-col justify-between items-center max-sm:absolute top-0 z-20
  ${isSideBarOpen ? 'translate-x-0' : 'max-sm:-translate-x-full'} transition-all duration-300 ease-in-out`}>
    <div className='w-full'>
      <img onClick={() => router.push('/')} src={assets.logo}  alt="" className='w-26 ml-7 my-2 cursor-pointer' />
      <MenuItems setSideBarOpen={setSideBarOpen} />
    </div>
  </div>

}

export default Sidebar




    // <div className="px-6 text-gray-600 space-y-1 font-medium h-full max-w-[20em] flex flex-col items-start gap-4 border-r-2 border-gray-200 bg-white">
    //   <div className='p-4'>
    //     <img src={assets.logo.src} alt="logo" className='w-40'/>
    //   </div>
    //   <hr className='border-b border-gray-200 w-[123%] -mx-6' />
    //   <div className='flex flex-col gap-1 items-start pl-4 text-xl my-0'>
    //     {
    //       menuItemsData.map(({to, label, Icon}) => {
    //         return <div key={to}>
    //           <button onClick={() => router.push(to)} className='p-1 rounded-lg w-50 flex gap-4 items-center hover:text-brand-1 hover:bg-brand-1/10 cursor-pointer hover:scale-105 transition duration-100 ease-in-out active:scale-100'>
    //             <Icon className='h-5 w-5'/>
    //             {label}
    //           </button>
    //         </div>
    //       })
    //     }
    //   </div>
    //   <div className='flex justify-center items-center w-full'>
    //     <button className='m-0 p-0 w-full flex items-center justify-center gap-2 py-2.5 mt-6 mx-0 rounded-lg bg-linear-to-r from-brand-1 to-brand-2 hover:from-indigo-700 hover:to-purple-800 active:scale-95 transition text-white cursor-pointer'>Create Post</button>
    //   </div>
    //   <div className='mt-auto p-10'>user account</div>
    //  </div>