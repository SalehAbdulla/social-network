"use client"
import React, { useState } from 'react'
import {assets} from '../../../public/assets';
import { Star } from 'lucide-react';
import { useForm } from 'react-hook-form';

const Login = () => {

  const {register, handleSubmit } = useForm();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  
  return (
    <div className='min-h-screen flex flex-col md:flex-row'>
      {/*BackGround Image*/}
      <img src={assets.bgImage.src} alt="" className='absolute top-0 left-0 -z-1 w-full h-full object-cover'/>
      {/* left side : Branding  */}
      <div className='flex-1 flex flex-col items-start justify-between p-6 md:p-10 lg:pl-40'>
      <img src={assets.logo.src} alt="" className='h-16 object-contain' />
      <div>
        <div className='flex items-center gap-3 mb-4 max-md:mt-10'>
          <img src={assets.group_users.src} alt="" className='h-8 md:h-10' />
          <div>
            <div className='flex'>
              {Array(5).fill(0).map((_,i)=>(<Star key={i} className='size-4 md:size-4.5 text-transparent fill-amber-500'/>))}
            </div>
            <p>Used by 12k+ developers</p>
          </div>
        </div>
        <h1 className='text-3xl md:text-6xl md:pb-2 font-bold bg-linear-to-r from-brand-1 to-brand-2 bg-clip-text text-transparent'>More than just friends truly connect</h1>
        <p className='text-4xl md:text-3xl text-brand-ink max-w-72 md:max-w-md'>connect with global community on pingup.</p>
      </div>
      <span className='md:h-10'></span>
      </div>
      {/* Right side :Login Form  */}
      <div className='flex-1 flex items-center justify-center p-6 sm:p-10'>
        {/* <SignIn routing="hash" /> */}
            <div className='w-100' >
                <div className='flex items-center justify-center gap-2 my-6'>
                  <button className={`${isLogin ? 'underline underline-offset-6' : ''}`} onClick={() => setIsLogin(true)}>login</button>
                  <br />
                  <button className={`${!isLogin ? 'underline underline-offset-6' : ''}`} onClick={() => setIsLogin(false)}>register</button>
                </div>
              {!isLogin ?
                <form onSubmit={handleSubmit((data) => {
                console.log(data);
              })} action="" className='flex flex-col gap-7'>
                  <input className='p-2' type="text" {...register("nickname")}  placeholder='Nickname'/>
                  <input className='p-2' type="email" {...register("email")}  placeholder='Email'/>
                  <input className='p-2' type="text" {...register("firstname")}  placeholder='FirstName'/>
                  <input className='p-2' type="text" {...register("lastname")}  placeholder='LastName'/>
                  <input className='p-2' type="password" {...register("password")}  placeholder='Password'/>
                  <input className='p-2' type="password" {...register("confirmpassword")}  placeholder='Confirm Password'/>
                  <input className='p-2' type="text" {...register("age")}  placeholder='age'/>
                  <input className='p-2' type="password" {...register("gender")}  placeholder='Gender'/>
                  <input className='p-2 bg-black text-white' type="submit" />
              </form>
            : 
              <form onSubmit={handleSubmit((data) => {
                console.log(data);
              })} action="" className='flex flex-col gap-7'>
                  <input className='p-2 text-sm w-full' type="text" {...register("identifier")}  placeholder='email or nickname'/>
                  <input className='p-2 text-sm' type="password" {...register("password")}  placeholder='password'/>
                  <input className={`p-2 bg-black text-white `} type="submit" />
              </form>
             }
            </div> 

      </div>
    </div>
  )
}

export default Login

