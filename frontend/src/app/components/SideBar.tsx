"use client"

import { useRouter } from 'next/navigation';
import {assets, menuItemsData} from '../../../public/assets';

const Sidebar = () => {

  const router = useRouter();

  return <>
    <div className="px-6 text-gray-600 space-y-1 font-medium h-full max-w-[20em] flex-1 items-start gap-4 border-r-2 border-gray-200">
      <div className='border-b-2 border-gray-200 p-4'>
        <img src={assets.logo.src} alt="logo" className='w-40'/>
      </div>
      <div className='flex flex-col gap-4 items-start pl-8 text-xl my-5'>
        {
          menuItemsData.map(({to, label, Icon}) => {
            return <>
              <button onClick={() => router.push(to)} className='flex gap-4 justify-between items-center hover:text-brand-1 cursor-pointer hover:scale-110 transition duration-100 ease-in-out active:scale-95'>
                <Icon className='h-5 w-5'/>
                {label}
              </button>
            </>
          })
        }
      </div>
      <div className='flex justify-center items-center'>
        <button className='m-4 p-4 w-full flex items-center justify-center gap-2 py-2.5 mt-6 mx-6 rounded-lg bg-gradient-to-r from-brand-1 to-brand-2 hover:from-indigo-700 hover:to-purple-800 active:scale-95 transition text-white cursor-pointer'>Create Post</button>
      </div>
      <div className='mt-[100%]'>user account</div>
    </div>
  </>
}

export default Sidebar

