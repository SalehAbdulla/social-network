"use client"

import React, { useEffect, useState } from "react";
import { EyeIcon, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import api from "../api/axios";
import toast from "react-hot-toast";
import { dummyUserData } from "../../../public/assets";

interface ConnectionUser {
  _id: string;
  full_name: string;
  username: string;
  bio: string;
  profile_picture: string;
}

const Messages = () => {
  const router = useRouter();
  const { getToken } = useAuth();
  const [connections, setConnections] = useState<ConnectionUser[]>([]);
  const user = dummyUserData;
  // const fetchConnections = async () => {
  //   try {
  //     const token = await getToken();
  //     const { data } = await api.get("/api/user/connections", {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     if (data.success) {
  //       setConnections(data.connections || []);
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
  //   fetchConnections();
  // }, []);

  return (
    <div className="min-h-screen relative bg-slate-50">
      <div className="max-w-6xl mx-auto p-6">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Messages</h1>
          <p className="text-slate-600">Talk to your friends and family</p>
        </div>

        {/* Connected users */}
        <div className="flex flex-col gap-3">
          {connections.map((user) => (
            <div
              key={user._id}
              className="max-w-xl flex flex-wrap gap-5 p-6 bg-white shadow rounded-md"
            >
              <img
                src={user.profile_picture}
                alt=""
                className="rounded-full size-12 mx-auto"
              />
              <div className="flex-1">
                <p className="font-medium text-slate-700">{user.full_name}</p>
                <p className="text-slate-500">@{user.username}</p>
                <p className="text-sm text-gray-600">{user.bio}</p>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  className="size-10 flex items-center justify-center text-sm rounded bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition cursor-pointer gap-1"
                  onClick={() => router.push(`/messages/${user._id}`)}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  className="size-10 flex items-center justify-center text-sm rounded bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition cursor-pointer"
                  onClick={() => router.push(`/profile/${user._id}`)}
                >
                  <EyeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Messages;