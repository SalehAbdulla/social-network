"use client"

import React, { useEffect, useRef, useState } from "react";
import { ImageIcon, SendHorizonal } from "lucide-react";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { dummyUserData } from "../../../../public/assets";
import MessageItem from "@/app/components/MessageItem";
// import api from "../api/axios";
// import MessageItem from "../components/MessageItem";

interface ChatMessage {
  _id: string;
  from_user_id: string;
  to_user_id: string;
  text: string;
  message_type: string;
  media_url: string;
  createdAt: string;
  seen: boolean;
}

interface PeerUser {
  _id: string;
  full_name: string;
  username: string;
  profile_picture: string;
}

const Page = () => {
  const params = useParams();
  const peerId = params?.userId as string | undefined;
  // const { userId: clerkUserId, getToken } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  // const [user, setUser] = useState<PeerUser | null>(null);
  const [media, setMedia] = useState<File | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const MAX_FILE_SIZE_MB = 25;

//   // Fetch peer user info
//   useEffect(() => {
//     if (!peerId) return;
//     const fetchPeer = async () => {
//       try {
//         const token = await getToken();
//         const { data } = await api.post(
//           "/api/user/profiles",
//           { profileId: peerId },
//           { headers: { Authorization: `Bearer ${token}` } }
//         );
//         if (data.success) setUser(data.profile);
//       } catch {
//         // ignore
//       }
//     };
//     fetchPeer();
//   }, [peerId, null]);

//   // Fetch messages - refetch periodically
//   const fetchUserMessages = async () => {
//     if (!peerId) return;
//     // try {
//     //   // const token = await getToken();÷
//     //   // const { data } = await api.get(`/api/message/${peerId}`, {
//     //     headers: { Authorization: `Bearer ${token}` },
//     //   });
//       if (data.success) {
//         setMessages(data.messages || []);
//       }
//     } catch (error: unknown) {
//       toast.error(error instanceof Error ? error.message : "Something went wrong");
//     }
//   };
// useEffect(() => {
//     fetchUserMessages();
//     const interval = setInterval(fetchUserMessages, 5000);
//     return () => clearInterval(interval);
//   }, [peerId]);

//   // Auto-scroll
//   useEffect(() => {
//     if (containerRef.current) {
//       containerRef.current.scrollTop = containerRef.current.scrollHeight;
//     }
//   }, [messages]);

//   const handleDeleteForMe = async (id: string) => {
//     try {
//       const token = await getToken();
//       const { data } = await api.delete(`/api/message/${id}/me`, {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       if (data.success) setMessages((prev) => prev.filter((m) => m._id !== id));
//     } catch (error: unknown) {
//       toast.error(error instanceof Error ? error.message : "Something went wrong");
//     }
//   };

//   const handleDeleteForEveryone = async (id: string) => {
//     try {
//       const token = await getToken();
//       const { data } = await api.delete(`/api/message/${id}/everyone`, {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       if (data.success) setMessages((prev) => prev.filter((m) => m._id !== id));
//     } catch (error: unknown) {
//       toast.error(error instanceof Error ? error.message : "Something went wrong");
//     }
//   };

//   const handleEdit = async (msg: { id: string; content: string }) => {
//     const newText = prompt("Edit your message:", msg.content);
//     if (!newText || !newText.trim()) return;
//     try {
//       const token = await getToken();
//       const { data } = await api.put(
//         `/api/message/${msg.id}/edit`,
//         { text: newText },
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//       if (data.success) {
//         setMessages((prev) =>
//           prev.map((m) => (m._id === data.message._id ? { ...m, text: data.message.text } : m))
//         );
//       }
//     } catch (error: unknown) {
//       toast.error(error instanceof Error ? error.message : "Something went wrong");
//     }
//   };

//   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;
//     if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
//       toast.error(`File size cannot exceed ${MAX_FILE_SIZE_MB} MB.`);
//       setMedia(null);
//       return;
//     }
//     if (!file.type.startsWith("image") && !file.type.startsWith("video")) {
//       toast.error("Only image and video files are allowed.");
//       setMedia(null);
//       return;
//     }
//     setMedia(file);
//   };

//   const sendMessage = async () => {
//     try {
//       if (!text && !media) return;
//       const token = await getToken();
//       const formData = new FormData();
//       formData.append("to_user_id", peerId || "");
//       if (text) formData.append("text", text);
//       if (media) formData.append("media", media);

//       const { data } = await api.post("/api/message/send", formData, {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       if (data.success) {
//         setText("");
//         setMedia(null);
//         fetchUserMessages();
//       } else {
//         toast.error(data.message);
//       }
//     } catch (error: unknown) {
//       toast.error(error instanceof Error ? error.message : "Something went wrong");
//     }
//   };

//   if (!user) {
//     return (
//       <div className="flex items-center justify-center h-screen">
//         <div className="w-10 h-10 rounded-full border-3 border-blue-500 border-t-transparent animate-spin" />
//       </div>
//     );
//   }
  const user = dummyUserData
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-2 p-2 md:px-10 xl:pl-42 bg-linear-to-r from-blue-50 to-blue-50 border-b border-gray-300">
        <img src={user.profile_picture.src} alt="" className="size-8 rounded-full" />
        <div>
          <p className="font-medium">{user.full_name}</p>
          <p className="text-sm text-gray-500 -mt-1.5">@{user.username}</p>
        </div>
      </div>

      {/* Messages container */}
      <div ref={containerRef} className="p-5 md:px-10 h-full overflow-y-scroll">
        <div className="space-y-4 max-w-4xl mx-auto">
          {[...messages]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .map((message) => (
              <MessageItem
                key={message._id}
                message={{
                  id: message._id,
                  type: message.message_type,
                  content: message.text || message.media_url,
                  senderId: message.from_user_id,
                }}
                currentUser={{ id: "123"  }}
                onEdit={()=> console.log('')}
                onDeleteForMe={()=> console.log('')}
                onDeleteForEveryone={()=> console.log('')}
              />
            ))}
        </div>
      </div>

      {/* Input */}
      <div className="px-4">
        <div className="flex items-center gap-3 pl-5 p-1.5 bg-white w-full max-w-xl mx-auto border border-gray-200 shadow rounded-full mb-5">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 outline-none text-slate-700"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // sendMessage();
              }
            }}
          />

          <label htmlFor="chat-file" className="cursor-pointer">
            {media ? (
              media.type.startsWith("image") ? (
                <img src={URL.createObjectURL(media)} alt="" className="h-8 rounded" />
              ) : (
                <video src={URL.createObjectURL(media)} className="h-8 rounded" muted />
              )
            ) : (
              <ImageIcon className="size-7 text-gray-400 cursor-pointer" />
            )}
            <input type="file" id="chat-file" accept="image/*,video/*" hidden  />
          </label>

          <button
            // onClick={sendMessage}
            className="bg-linear-to-br from-blue-500 to-blue-600 hover:from-blue-700 hover:to-blue-700 active:scale-95 cursor-pointer text-white p-2 rounded-full"
          >
            <SendHorizonal size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Page;