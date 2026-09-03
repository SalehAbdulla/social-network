import React, { useEffect, useState } from 'react'
import { dummyStoriesData } from '../../../public/assets';
import { Plus } from 'lucide-react';
import StoryItem from "./StoryItem";
import StoryViewer from "./StoryViewer";
import { useAuth } from '@clerk/nextjs';
import StoryModal from './StoryModal';
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
        posts: never[];
        is_verified: boolean;
        createdAt: string;
        updatedAt: string;
    };
    content: string;
    media_url: string;
    media_type: string;
    background_color: string;
    createdAt: string;
    updatedAt: string;
}

const StoriesBar = () => {
    const { getToken, userId } = useAuth();
    const [showModel, setShowModel] = useState(false);
    const [stories, setStories] = useState<StoryType[]>([]);
    const [viewStory, setViewStory] = useState(null);

    const fetchStories = async () => {
        setStories(dummyStoriesData);
    }

    useEffect(()=> {
        fetchStories();
    }, [])

  return (
        <div className="w-screen sm:w-[calc(100vw-240px)] lg:max-w-2xl no-scrollbar overflow-x-auto px-4">
          <div className="flex gap-4 pb-5">
            {/* Add story card */}
            <div
              className="rounded-lg shadow-sm min-w-30 max-w-30 max-h-40 aspect-3/4 cursor-pointer hover:shadow-lg transition-all duration-200 border-2 border-dashed border-blue-300 bg-linear-to-b from-blue-50 to-white"
            >
              <div className="h-full flex flex-col items-center justify-center p-4">
                <div className="size-10 bg-blue-500 rounded-full flex items-center justify-center mb-3">
                  <Plus className="h-5 w-5 text-white" />
                </div>
                <p className="text-sm font-medium text-slate-700">Create Story</p>
              </div>
            </div>
    
            {/* Story items */}
            {stories.map((story, index) => (
              <StoryItem
                key={index}
                story={story}
                fetchStories={fetchStories}
                currentUserId={userId}
                onView={null}
              />
            ))}
          </div>
    
          {/* Add Story Model */}
          {showModel && (
            <StoryModal setShowModal={setShowModel} fetchStories={fetchStories} />
          )}
    
          {/* View Story */}
          {viewStory && (
            <StoryViewer viewStory={viewStory} setViewStory={setViewStory} />
          )}
        </div>
  )
}

export default StoriesBar