import React from 'react'

const Loading = ({height = 100}) => {
  return (
    <div style={{height}} className='w-full flex items-center justify-center h-screen'>
        <div className='w-10 h-10 rounded-full border-3 borded-brand-1 border-t-transparent animate-spin'>
        </div>
    </div>
  )
}

export default Loading