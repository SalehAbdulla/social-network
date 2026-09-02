import React, { useState } from 'react'
import { dummyStoriesData } from '../../../public/assets';
import { StaticImageData } from 'next/image';

interface StoryType {
    _id: string;
    user: {
        _id: string;
        email: string;
        full_name: string;
        username: string;
        bio: string;
        profile_picture: string | StaticImageData;
        cover_photo: string | StaticImageData;
        location: string;
        followers: string[];
        following: string[];
        connections: string[];
        posts: string[];
        is_verified: boolean;
        createdAt: string;
        updatedAt: string;
    };
    content: string;
    media_url: string;
    media_type: 'text' | 'image' | 'video';
    background_color: string;
    createdAt: string;
    updatedAt: string;
}

const StoriesBar = () => {

    const [stories] = useState<StoryType[]>(dummyStoriesData);

  return (
    <div className=''>
        
    </div>
  )
}

export default StoriesBar