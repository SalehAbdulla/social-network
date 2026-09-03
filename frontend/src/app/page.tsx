"use client"
import { useEffect, useState } from "react";
import { assets, dummyPostsData } from "../../public/assets";
import { StaticImageData } from "next/image";
import Loading from "./components/Loading";
import StoriesBar from "./components/StoriesBar";
import PostCard from "./components/PostCard";

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
      <div className="h-full overflow-y-scroll no-scrollbar py-10 xl:pr-5 flex items-start justify-center xl:gap-8">
        {/* stories and post list */}
        <div>
          <StoriesBar />
          <div className="p-4 space-y-6">
            {feeds.map((post) => (
              <PostCard key={post._id} post={post} fetchPosts={fetchFeeds} />
            ))}
          </div>
        </div>
  
        {/* Right sidebar */}
        <div className="max-xl:hidden sticky top-20">

          {/* <RecentMessages /> */}
        </div>
      </div>
    ) : (
      <Loading />
    );
}

export default Feed