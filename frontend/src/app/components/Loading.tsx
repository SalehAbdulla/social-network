import React from 'react'

const Loading = ({height = 100}) => {
  return (
    <div style={{height}} className='flex items-center justify-between h-screen'>
        <div className='w-10 h-10 rounded-full border-3 borded-brand-1 border-t-transparent animate-spin'>
        </div>
    </div>
  )
}

export default Loading