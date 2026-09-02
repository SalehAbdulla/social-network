
"use client"

import React, { useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import api from "../api/axios";
import toast from "react-hot-toast";
import Loading from "../components/Loading";
import UserCard from "../components/UserCard";

interface DiscoverUser {
  _id: string;
  full_name: string;
  username: string;
  bio: string;
  location: string;
  profile_picture: string;
  followers: string[];
  following: string[];
  connections: string[];
}

const Discover = () => {
  const { getToken, userId } = useAuth();
  const [input, setInput] = useState("");
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState<string[]>([]);
  const [connections, setConnections] = useState<string[]>([]);

  const fetchCurrentUser = async () => {
    try {
      const token = await getToken();
      const { data } = await api.get("/api/user/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.success) {
        setFollowing(data.user?.following || []);
        setConnections(data.user?.connections || []);
      }
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    if (userId) fetchCurrentUser();
  }, [userId, getToken]);

  const handleSearch = async (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      try {
        setUsers([]);
        setLoading(true);
        const token = await getToken();
        const { data } = await api.post(
          "/api/user/discover",
          { input },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (data.success) {
          setUsers(data.users);
        } else {
          toast.error(data.message);
        }
        setInput("");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Something went wrong";
        toast.error(message);
      }
      setLoading(false);
    }
  };

  const handleFollow = async (userIdToFollow: string) => {
    try {
      const token = await getToken();
      const { data } = await api.post(
        "/api/user/follow",
        { id: userIdToFollow },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (data.success) {
        toast.success(data.message);
        setFollowing((prev) =>
          prev.includes(userIdToFollow) ? prev : [...prev, userIdToFollow]
        );
      } else {
        toast.error(data.message);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    }
  };

  const handleConnect = async (userIdToConnect: string) => {
    try {
      const token = await getToken();
      const { data } = await api.post(
        "/api/user/connect",
        { id: userIdToConnect },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (data.success) {
        toast.success(data.message);
        fetchCurrentUser(); // refresh connection state
      } else {
        toast.error(data.message);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto p-6">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Discover People
          </h1>
          <p className="text-slate-600">
            Connect with amazing people and grow your network
          </p>
        </div>

        {/* Search */}
        <div className="mb-8 shadow-md rounded-md border border-slate-200/60 bg-white/80">
          <div className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search people by name, username, bio or location..."
                className="pl-10 sm:pl-12 py-2 w-full border border-gray-300 rounded-md max-sm:text-sm"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyUp={handleSearch}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          {users.map((user) => (
            <UserCard
              key={user._id}
              user={user}
              isFollowing={following.includes(user._id)}
              isConnected={connections.includes(user._id)}
              onFollow={() => handleFollow(user._id)}
              onConnect={() => handleConnect(user._id)}
            />
          ))}
        </div>

        {loading && <Loading height={60} />}
      </div>
    </div>
  );
};

export default Discover;