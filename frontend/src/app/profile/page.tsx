
"use client"

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Loading from "../components/Loading";
import UserProfileInfo from "../components/UserProfileInfo";
import PostCard from "../components/PostCard";
import ProfileModel from "../components/ProfileModel";
import api from "../api/axios";
import toast from "react-hot-toast";
import { StaticImageData } from "next/image";
import { imageSrc } from "../lib/imageSrc";
import { dummyUserData } from "../../../public/assets";

interface ProfileUser {
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
}

interface PostItem {
  _id: string;
  user: ProfileUser;
  content: string;
  image_urls: string[];
  post_type: string;
  likes_count: string[];
  createdAt: string;
  updatedAt: string;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return `${interval} year${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return `${interval} month${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return `${interval} day${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return `${interval} hour${interval === 1 ? "" : "s"} ago`;
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return `${interval} minute${interval === 1 ? "" : "s"} ago`;
  return "just now";
}

const Profile = () => {
  const params = useParams();
  const profileId = params?.profileId as string | undefined;
  // const [user, setUser] = useState<ProfileUser | null>(null);
  const user = dummyUserData;
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [activeTab, setActiveTab] = useState("posts");
  const [showEdit, setShowEdit] = useState(false);

  // const fetchUserProfile = async (id?: string) => {
  //   const token = await getToken();
  //   try {
  //     const { data } = await api.post(
  //       "/api/user/profiles",
  //       { profileId: id },
  //       { headers: { Authorization: `Bearer ${token}` } }
  //     );
  //     if (data.success) {
  //       setUser(data.profile);
  //       setPosts(data.posts);
  //     } else {
  //       toast.error(data.message);
  //     }
  //   } catch (error: unknown) {
  //     const message =
  //       error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  // useEffect(() => {
  //   if (profileId) {
  //     fetchUserProfile(profileId);
  //   } else {
  //     const fetchOwnProfile = async () => {
  //       try {
  //         const token = await getToken();
  //         const { data } = await api.get("/api/user/me", {
  //           headers: { Authorization: `Bearer ${token}` },
  //         });
  //         if (data.success) {
  //           fetchUserProfile(data.user._id);
  //         }
  //       } catch {
  //         // fallback
  //       }
  //     };
  //     if (userId) fetchOwnProfile();
  //   }
  // }, [profileId, userId]);



return user ? (
    <div className="relative h-full overflow-y-scroll bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <div className="h-40 md:h-56 bg-gradient-to-r from-blue-200 via-blue-200 to-pink-200">
            {user.cover_photo && (
              <img src={imageSrc(user.cover_photo)} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <UserProfileInfo user={user} posts={posts} profileId={profileId} setShowEdit={setShowEdit} />
        </div>

        <div className="mt-6">
          <div className="bg-white rounded-xl shadow p-1 flex max-w-md mx-auto">
            {["posts", "media", "likes"].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 px-5 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === tab ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "posts" && (
          <div className="mt-6 flex flex-col items-center gap-6">
            {posts.map((post) => (
              <PostCard key={post._id} post={post} fetchPosts={() => {}} />
            ))}
          </div>
        )}

        {activeTab === "media" && (
          <div className="mt-6 flex flex-wrap max-w-6xl">
            {posts.filter((p) => p.image_urls.length > 0).map((post) => (
              <React.Fragment key={post._id}>
                {post.image_urls.map((image, index) => (
                  <Link target="_blank" href={image} key={index} className="relative group">
                    <img src={image} alt="" className="w-64 aspect-video object-cover" />
                    <p className="absolute bottom-0 right-0 text-xs p-1 px-3 backdrop-blur-xl text-white opacity-0 group-hover:opacity-100 transition duration-300">
                      Posted {timeAgo(post.createdAt)}
                    </p>
                  </Link>
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      {showEdit && <ProfileModel setShowEdit={setShowEdit} />}
    </div>
  ) : (
    <Loading />
  );
};

export default Profile;