"use client"

// ── Messages Inbox ─────────────────────────────────────────────────
// A clean inbox showing chat users in a sidebar and messages in a thread.
// Uses GET /api/v1/messages/users for the user list and
// GET /api/v1/messages?partnerId=X for the chat thread.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  SendHorizonal,
  MessageSquare,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import api from "../api/axios";
import Avatar from "../components/Avatar";
import MessageItem from "../components/MessageItem";
import toast from "react-hot-toast";

// ── Types ───────────────────────────────────────────────────────────

interface ChatUserDTO {
  userId: string;
  nickname: string;
  isOnline: number;
  lastMessageTime: string;
}

interface UserProfile {
  _id: string;
  full_name: string;
  username: string;
  profile_picture: string;
}

interface MessageDTO {
  messageId: number;
  senderId: string;
  recipientId: string;
  textMessage: string;
  timeStamp: string;
  isRead: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Component ───────────────────────────────────────────────────────

export default function MessagesInboxPage() {
  const { userId, getToken } = useAuth();

  // ── State ──
  const [chatUsers, setChatUsers] = useState<ChatUserDTO[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [text, setText] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [mobileShowThread, setMobileShowThread] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// ── Fetch chat users ──────────────────────────────────────────────
  const fetchChatUsers = useCallback(async () => {
    if (!userId) return;
    try {
      const token = await getToken();
      const { data } = await api.get("/api/v1/messages", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.success) {
        const users: ChatUserDTO[] = data.data || [];
        setChatUsers(users);

        // Fetch profiles for each user (batch)
        const profileMap: Record<string, UserProfile> = { ...profiles };
        for (const u of users) {
          if (!profileMap[u.userId]) {
            try {
              const pRes = await api.post(
                "/api/user/profiles",
                { profileId: u.userId },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (pRes.data.success) {
                profileMap[u.userId] = pRes.data.profile;
              }
            } catch {
              // skip
            }
          }
        }
        setProfiles(profileMap);
      }
    } catch {
      setError("Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, [userId, getToken]);

  // ── Fetch messages for selected user ──────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!selectedUserId) return;
    try {
      const token = await getToken();
      const { data } = await api.get(
        `/api/v1/messages?partnerId=${selectedUserId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (data.success && data.data?.messages) {
        const msgs: MessageDTO[] = data.data.messages;
        msgs.sort(
          (a, b) =>
            new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime()
        );
        setMessages(msgs);
      }
    } catch {
      // ignore
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedUserId, getToken]);

  // ── WebSocket ─────────────────────────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!userId || wsRef.current) return;

    const token = document.cookie
      .split("; ")
      .find((row) => row.startsWith("session_token="))
      ?.split("=")[1];

    const wsUrl = `ws://localhost:3000/ws${token ? `?token=${token}` : ""}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "incoming_msg") {
          const payload = msg.payload;
          setMessages((prev) => {
            const exists = prev.some(
              (m) => m.messageId === payload.messageId
            );
            if (exists) return prev;
            return [
              ...prev,
              {
                messageId: payload.messageId,
                senderId: payload.senderId,
                recipientId: selectedUserId || "",
                textMessage: payload.text,
                timeStamp: payload.timeStamp,
                isRead: 0,
              },
            ];
          });
          fetchChatUsers();
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  }, [userId, selectedUserId, fetchChatUsers]);

  // ── Send message ──────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!text.trim() || !selectedUserId) return;
    const trimmed = text.trim();
    setText("");

    const optimistic: MessageDTO = {
      messageId: Date.now(),
      senderId: userId || "",
      recipientId: selectedUserId,
      textMessage: trimmed,
      timeStamp: new Date().toISOString(),
      isRead: 0,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const token = await getToken();
      await api.post(
        "/api/v1/messages/send",
        { recipientId: selectedUserId, text: trimmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      toast.error("Failed to send message");
      setMessages((prev) =>
        prev.filter((m) => m.messageId !== optimistic.messageId)
      );
    }
  };

  // ── Search users ──────────────────────────────────────────────────
  const searchUsers = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const token = await getToken();
      const { data } = await api.post(
        "/api/user/discover",
        { input: query.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (data.success) {
        setSearchResults(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  };
// ── Effects ───────────────────────────────────────────────────────
  useEffect(() => {
    fetchChatUsers();
  }, [fetchChatUsers]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWebSocket]);

  useEffect(() => {
    if (selectedUserId) {
      setMessagesLoading(true);
      fetchMessages();
      pollRef.current = setInterval(fetchMessages, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedUserId, fetchMessages]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // ── Derived ───────────────────────────────────────────────────────
  const selectedProfile = selectedUserId ? profiles[selectedUserId] : null;
  const sortedUsers = [...chatUsers].sort((a, b) => {
    const aTime = a.lastMessageTime
      ? new Date(a.lastMessageTime).getTime()
      : 0;
    const bTime = b.lastMessageTime
      ? new Date(b.lastMessageTime).getTime()
      : 0;
    return bTime - aTime;
  });

  const selectUser = (uid: string) => {
    setSelectedUserId(uid);
    setMobileShowThread(true);
    if (!profiles[uid]) {
      getToken().then((token) => {
        api
          .post(
            "/api/user/profiles",
            { profileId: uid },
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .then((res) => {
            if (res.data.success) {
              setProfiles((prev) => ({ ...prev, [uid]: res.data.profile }));
            }
          })
          .catch(() => {});
      });
    }
  };

  const startChat = (profile: UserProfile) => {
    setProfiles((prev) => ({ ...prev, [profile._id]: profile }));
    setSelectedUserId(profile._id);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setMobileShowThread(true);
  };
// ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50">
      {/* ── Sidebar ── */}
      <div
        className={`${
          mobileShowThread ? "hidden md:flex" : "flex"
        } w-full md:w-80 lg:w-96 flex-shrink-0 flex-col border-r border-slate-200 bg-white`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Messages</h2>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition"
            title="New message"
          >
            <MessageSquare size={18} />
          </button>
        </div>

        {/* Chat user list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 py-8 text-center px-4">
              {error}
            </p>
          ) : sortedUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400 px-4">
              <MessageSquare size={32} className="mx-auto mb-3 opacity-40" />
              <p>No conversations yet.</p>
              <p className="mt-1">Search for someone to start chatting.</p>
            </div>
          ) : (
            sortedUsers.map((u) => {
              const profile = profiles[u.userId];
              const isSelected = u.userId === selectedUserId;
              return (
                <button
                  key={u.userId}
                  onClick={() => selectUser(u.userId)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                  }`}
                >
                  <div className="relative">
                    <Avatar
                      name={
                        profile?.full_name || profile?.username || u.nickname
                      }
                      avatarUrl={profile?.profile_picture}
                      size={44}
                    />
                    {u.isOnline === 1 && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800 truncate text-sm">
                        {profile?.full_name || u.nickname}
                      </span>
                      {u.lastMessageTime && (
                        <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                          {relativeTime(u.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    {profile?.username && (
                      <p className="text-xs text-slate-400 truncate">
                        @{profile.username}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
{/* ── Thread ── */}
      <div
        className={`${
          mobileShowThread ? "flex" : "hidden md:flex"
        } flex-1 flex-col min-w-0`}
      >
        {selectedUserId && selectedProfile ? (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200">
              <button
                onClick={() => setMobileShowThread(false)}
                className="md:hidden p-1 rounded hover:bg-slate-100"
              >
                <ArrowLeft size={20} />
              </button>
              <Avatar
                name={
                  selectedProfile.full_name ||
                  selectedProfile.username ||
                  selectedUserId
                }
                avatarUrl={selectedProfile.profile_picture}
                size={36}
              />
              <div className="min-w-0">
                <p className="font-medium text-sm text-slate-800 truncate">
                  {selectedProfile.full_name || selectedProfile.username}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  @{selectedProfile.username || selectedUserId}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={containerRef}
              className="flex-1 overflow-y-auto px-4 py-3"
            >
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2
                    size={24}
                    className="animate-spin text-slate-400"
                  />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">
                  No messages yet. Say hello!
                </p>
              ) : (
                <div className="space-y-3 max-w-2xl mx-auto">
                  {messages.map((msg) => (
                    <MessageItem
                      key={msg.messageId}
                      message={{
                        id: String(msg.messageId),
                        type: "text",
                        content: msg.textMessage,
                        senderId: msg.senderId,
                      }}
                      currentUser={{ id: userId || "" }}
                      onEdit={() => {}}
                      onDeleteForMe={() => {}}
                      onDeleteForEveryone={() => {}}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-3 bg-white border-t border-slate-200">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <input
                  type="text"
                  placeholder="Type a message..."
                  className="flex-1 border border-slate-300 rounded-full px-4 py-2 text-sm outline-none focus:border-blue-400 transition"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!text.trim()}
                  className="p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition flex-shrink-0"
                >
                  <SendHorizonal size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare
                size={48}
                className="mx-auto mb-4 text-slate-300"
              />
              <p className="text-slate-400 text-sm">
                Select a conversation to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
{/* ── New Chat Search Modal ── */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40"
          onClick={() => {
            setSearchOpen(false);
            setSearchQuery("");
            setSearchResults([]);
          }}
        >
          <div
            className="w-full max-w-md bg-white rounded-xl shadow-2xl mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-3">
                New Message
              </h3>
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="Search people by name or username..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-400 transition"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searchLoading && (
                  <Loader2
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
                  />
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {searchResults.length === 0 &&
                searchQuery.trim().length >= 2 &&
                !searchLoading && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    No users found.
                  </p>
                )}
              {searchResults.map((user) => (
                <button
                  key={user._id}
                  onClick={() => startChat(user)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
                >
                  <Avatar
                    name={user.full_name || user.username}
                    avatarUrl={user.profile_picture}
                    size={40}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">
                      {user.full_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      @{user.username}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}