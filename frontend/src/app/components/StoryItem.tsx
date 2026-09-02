"use client"

import { useState } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import api from "../api/axios";
import { useAuth } from "@clerk/clerk-react";

const StoryItem = ({ story, fetchStories, currentUserId, onView }) => {
  const [menuOpen, setMenuOpen] = useState(null);
  const { getToken } = useAuth();

  const handleDeleteStory = async (storyId) => {
    const token = await getToken();
    try {
      await api.delete(`/api/story/${storyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Story deleted successfully");
      fetchStories();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div
      onClick={() => onView(story)}
      className="relative rounded-lg shadow min-w-30 max-w-30 max-h-40 aspect-[3/4] cursor-pointer hover:shadow-lg transition-all duration-200 bg-gradient-to-b from-indigo-500 to-purple-600 hover:from-indigo-700 hover:to-purple-800 active:scale-95 overflow-hidden"
    >
      {/* Profile picture */}
      <img
        src={story.user.profile_picture}
        alt=""
        className="absolute size-8 top-3 left-3 z-10 rounded-full ring-gray-100 shadow"
      />

      {/* Story text */}
      {story.content && (
        <p className="absolute top-18 left-3 text-white/60 text-sm truncate max-w-24">
          {story.content}
        </p>
      )}

      {/* Media preview */}
      {story.media_type !== "text" && (
        <div className="absolute inset-0 z-1 rounded-lg bg-black overflow-hidden">
          {story.media_type === "image" ? (
            <img
              src={story.media_url}
              alt="story"
              className="h-full w-full object-cover hover:scale-110 transition duration-500 opacity-70 hover:opacity-80"
            />
          ) : (
            <video
              src={story.media_url}
              className="h-full w-full object-cover hover:scale-110 transition duration-500 opacity-70 hover:opacity-80"
            />
          )}
        </div>
      )}

      {/* Time */}
      <p className="text-white absolute bottom-1 right-2 z-10 text-xs">
        {new Date(story.createdAt).toLocaleTimeString()}
      </p>

      {/* Delete menu only for my stories */}
      {story.user._id === currentUserId && (
        <div
          className="absolute top-2 right-2 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical
            className="w-5 h-5 cursor-pointer text-white"
            onClick={() => setMenuOpen(menuOpen === story._id ? null : story._id)}
          />
          {menuOpen === story._id && (
            <div className="absolute right-0 mt-1 bg-white border rounded shadow-md text-sm z-30">
              <div
                className="px-3 py-1 hover:bg-gray-100 cursor-pointer flex items-center gap-1 text-red-500"
                onClick={() => handleDeleteStory(story._id)}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StoryItem;
