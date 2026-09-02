"use client"

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import api from "../api/axios";
import toast from "react-hot-toast";

interface ProfileModelProps {
  setShowEdit: (show: boolean) => void;
}

interface UserProfile {
  username: string;
  bio: string;
  location: string;
  full_name: string;
  profile_picture: string;
  cover_photo: string;
}

const ProfileModel = ({ setShowEdit }: ProfileModelProps) => {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    username: "",
    bio: "",
    location: "",
    full_name: user?.fullName || "",
    profile_picture: null as File | null,
    cover_photo: null as File | null,
  });
  const [loaded, setLoaded] = useState(false);

  // React.useEffect(() => {
  //   const fetchProfile = async () => {
  //     try {
  //       const token = await getToken();
  //       const { data } = await api.get("/api/user/me", {
  //         headers: { Authorization: `Bearer ${token}` },
  //       });
  //       if (data.success && data.user) {
  //         setUserProfile(data.user);
  //         setEditForm({
  //           username: data.user.username || "",
  //           bio: data.user.bio || "",
  //           location: data.user.location || "",
  //           full_name: data.user.full_name || user?.fullName || "",
  //           profile_picture: null,
  //           cover_photo: null,
  //         });
  //       }
  //     } catch {
  //       // use defaults
  //     }
  //     setLoaded(true);
  //   };
  //   fetchProfile();
  // }, [getToken, user]);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const userData = new FormData();
      userData.append("username", editForm.username);
      userData.append("bio", editForm.bio);
      userData.append("location", editForm.location);
      userData.append("full_name", editForm.full_name);
      if (editForm.profile_picture) userData.append("profile", editForm.profile_picture);
      if (editForm.cover_photo) userData.append("cover", editForm.cover_photo);

      const token = await getToken();
      const { data } = await api.put("/api/user/update", userData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      if (data.success) {
        toast.success("Profile updated!");
        setShowEdit(false);
        window.location.reload();
      } else {
        toast.error(data.message || "Failed to update profile");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    }
  };
if (!loaded) {
    return (
      <div className="fixed top-0 bottom-0 left-0 right-0 z-110 h-screen bg-black/50 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-3 border-white border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed top-0 bottom-0 left-0 right-0 z-110 h-screen overflow-y-scroll bg-black/50">
      <div className="max-w-2xl sm:py-6 mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Profile</h1>
          <form className="space-y-4" onSubmit={(e) => toast.promise(handleSaveProfile(e), { loading: "Saving..." })}>
            <div className="flex flex-col items-start gap-3">
              <label htmlFor="pfp" className="block text-sm font-medium text-gray-700 mb-1">
                Profile Picture
                <input type="file" id="pfp" accept="image/*" hidden
                  onChange={(e) => setEditForm({ ...editForm, profile_picture: e.target.files?.[0] || null })}
                />
                <div className="group/pfp relative">
                  <img
                    src={editForm.profile_picture ? URL.createObjectURL(editForm.profile_picture) : userProfile?.profile_picture || user?.imageUrl || ""}
                    alt="" className="w-24 h-24 rounded-full object-cover mt-2"
                  />
                  <div className="absolute hidden group-hover/pfp:flex top-0 left-0 right-0 bottom-0 bg-black/20 rounded-full items-center justify-center">
                    <Pencil className="w-5 h-5 text-white" />
                  </div>
                </div>
              </label>
            </div>
            <div className="flex flex-col items-start gap-3">
              <label htmlFor="cvp" className="block text-sm font-medium text-gray-700 mb-1">
                Cover Photo
                <input type="file" id="cvp" accept="image/*" hidden
                  onChange={(e) => setEditForm({ ...editForm, cover_photo: e.target.files?.[0] || null })}
                />
                <div className="group/cvp relative">
                  <img
                    src={editForm.cover_photo ? URL.createObjectURL(editForm.cover_photo) : userProfile?.cover_photo || ""}
                    alt="" className="w-80 h-40 rounded-lg bg-gradient-to-r from-blue-200 via-blue-200 to-pink-200 object-cover mt-2"
                  />
                  <div className="absolute hidden group-hover/cvp:flex top-0 left-0 right-0 bottom-0 bg-black/20 rounded-lg items-center justify-center">
                    <Pencil className="w-5 h-5 text-white" />
                  </div>
                </div>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" placeholder="Please enter your full name" className="w-full p-3 border border-gray-200 rounded-lg"
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} value={editForm.full_name}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input type="text" className="w-full p-3 border border-gray-200 rounded-lg" placeholder="Please enter your username"
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} value={editForm.username}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea rows={3} className="w-full p-3 border border-gray-200 rounded-lg" placeholder="Please enter a short bio"
                onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} value={editForm.bio}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input type="text" className="w-full p-3 border border-gray-200 rounded-lg" placeholder="Please enter your location"
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} value={editForm.location}
              />
            </div>
            <div className="flex justify-end space-x-3 pt-6">
              <button onClick={() => setShowEdit(false)} type="button" className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition cursor-pointer">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileModel;