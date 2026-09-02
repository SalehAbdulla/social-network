"use client"

import React from "react";
import { MapPin, MessageCircle, Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

interface UserCardUser {
  _id: string;
  full_name: string;
  username: string;
  bio: string;
  location: string;
  profile_picture: string;
  followers: string[];
}

interface UserCardProps {
  user: UserCardUser;
  isFollowing: boolean;
  isConnected: boolean;
  onFollow: () => void;
  onConnect: () => void;
}

const UserCard = ({ user, isFollowing, isConnected, onFollow, onConnect }: UserCardProps) => {
  const router = useRouter();

  const handleConnectClick = () => {
    if (isConnected) {
      router.push(`/messages/${user._id}`);
    } else {
      onConnect();
    }
  };

  return (
    <div className="p-4 pt-6 flex flex-col justify-between w-72 shadow border border-gray-200 rounded-md">
      <div className="text-center">
        <img
          src={user.profile_picture}
          alt=""
          className="rounded-full w-16 shadow-md mx-auto"
        />
        <p className="mt-4 font-semibold">{user.full_name}</p>
        {user.username && (
          <p className="text-gray-500 font-light">@{user.username}</p>
        )}
        {user.bio && (
          <p className="text-gray-600 mt-2 text-center text-sm px-4">
            {user.bio}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 mt-4 text-xs text-gray-600">
        <div className="flex items-center gap-1 border border-gray-300 rounded-full px-3 py-1">
          <MapPin className="h-4 w-4" /> {user.location}
        </div>
        <div className="flex items-center gap-1 border border-gray-300 rounded-full px-3 py-1">
          <span>{user.followers.length}</span>Followers
        </div>
      </div>

      <div className="flex mt-2 gap-2">
        <button
          onClick={onFollow}
          disabled={isFollowing}
          className="w-full py-2 rounded-md flex justify-center items-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:scale-95 transition text-white cursor-pointer disabled:opacity-50"
        >
          <UserPlus className="w-4 h-4" />
          {isFollowing ? "Following" : "Follow"}
        </button>

        <button
          onClick={handleConnectClick}
          className="flex items-center justify-center w-16 border text-slate-500 group rounded-md cursor-pointer active:scale-95 transition"
        >
          {isConnected ? (
            <MessageCircle className="w-5 h-5 group-hover:scale-105 transition" />
          ) : (
            <Plus className="w-5 h-5 group-hover:scale-95 transition" />
          )}
        </button>
      </div>
    </div>
  );
};

export default UserCard;