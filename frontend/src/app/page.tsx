"use client"
import { useEffect, useState } from "react";
import { dummyPostsData } from "../../public/assets";
import { StaticImageData } from "next/image";
import Loading from "./components/Loading";

interface FeedPost {
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
  image_urls: string[];
  post_type: string;
  likes_count: string[];
  createdAt: string;
  updatedAt: string;
}


const Feed = () => {

  const [feeds, setFeeds] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true)

  const fetchFeeds = async () => {
    setFeeds(dummyPostsData);
    setLoading(false)
  }

  useEffect(() => {
    fetchFeeds();
  },[])

  return !loading ? (
    <div className="h-full overflow-y-scroll no-scrollbar py-10 x;:pr-5 flex items-center justify-center xl:gap-8">
      {/* Stories and post list */}
      <div>
        <h1>Stories here</h1>
        <div className="p-4 space-y-6">
          List of Post
        </div>
      </div>

      {/* Right Sidebar */}
      <div>
        <div>
          Sponsored
        </div>
        <div>
          recent messages
        </div>
      </div>


    </div>
  ): <Loading />
}

export default Feed