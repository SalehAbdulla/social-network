"use client"
import { ArrowLeft, Sparkle, TextIcon, Upload } from "lucide-react";
import React, { useState } from "react";
import { toast } from "react-hot-toast";
import api from "../api/axios";

const StoryModal = ({ setShowModal: setShowModel, fetchStories }: {
  setShowModal: (show: boolean) => void;
  fetchStories: () => void;
}) => {
  const bgColors = ["#4f46e5", "#7c3aed", "#db2777", "#e11d48", "#ea8a04", "#bd9488"];
  const [mode, setMode] = useState("text");
  const [background, setBackground] = useState(bgColors[0]);
  const [text, setText] = useState("");
  const [media, setMedia] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);


  const MAX_VIDEO_DURATION = 60; // seconds
  const MAX_VIDEO_SIZE_MB = 50; // in mb

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video")) {
      if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
        toast.error(`Video file size cannot exceed ${MAX_VIDEO_SIZE_MB}MB.`);
        return;
      }

      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > MAX_VIDEO_DURATION) {
          toast.error(`Video duration cannot exceed ${MAX_VIDEO_DURATION} seconds`);
        } else {
          setMedia(file);
          setPreviewUrl(URL.createObjectURL(file));
          setMode("media");
          setText(" ");
        }
      };
    } else if (file.type.startsWith("image")) {
      setMedia(file);
      setPreviewUrl(URL.createObjectURL(file));
      setMode("media");
      setText(" ");
    }
  };

  // const handleCreateStory = async () => {
  //   const media_type =
  //     mode === "media"
  //       ? media?.type.startsWith("image")
  //         ? "image"
  //         : "video"
  //       : "text";

  //   if (media_type === "text" && !text.trim()) {
  //     return toast.error("Please enter some text.");
  //   }

  //   const formData = new FormData();
  //   formData.append("content", text);
  //   formData.append("media_type", media_type);
  //   formData.append("background_color", background);
  //   if (media) formData.append("media", media);

  //   try {
  //     const { data } = await api.post(`/api/story/create`, formData, {
  //       headers: { Authorization: `Bearer ${token}` },
  //     });
  //     if (data.success) {
  //       setShowModel(false);
  //       toast.success("Story created successfully");
  //       fetchStories();
  //     } else {
  //       toast.error(data.message);
  //     }
  //   } catch (error: unknown) {
  //     const message = error instanceof Error ? error.message : "Something went wrong";
  //     toast.error(message);
  //   }
  // };

  return (
    <div className="fixed inset-0 z-50 min-h-screen bg-black/80 backdrop-blur text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-4 flex items-center justify-between">
          <button onClick={() => setShowModel(false)} className="text-white p-2">
            <ArrowLeft />
          </button>
          <h2 className="text-lg font-semibold">Create Story</h2>
          <span className="w-10"></span>
        </div>

        {/* Preview Box */}
        <div className="rounded-lg h-96 flex items-center justify-center relative" style={{ backgroundColor: background }}>
          {mode === "text" && (
            <textarea
              className="bg-transparent text-white w-full h-full p-6 text-lg resize-none focus:outline-none"
              placeholder="What's on your mind?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          {mode === "media" && previewUrl && (
            media?.type.startsWith("image") ? (
              <img className="w-full h-full object-cover rounded-lg" src={previewUrl} alt="preview" />
            ) : (
              <video className="w-full h-full object-cover rounded-lg" src={previewUrl} controls playsInline />
            )
          )}
        </div>

        {/* Background colors */}
        <div className="flex mt-4 gap-2">
          {bgColors.map((color) => (
            <button
              key={color}
              className="w-6 h-6 rounded-full ring cursor-pointer"
              style={{ backgroundColor: color }}
              onClick={() => setBackground(color)}
            />
          ))}
        </div>

        {/* Mode toggle */}
        <div className="flex mt-4 gap-2">
          <button
            onClick={() => {
              setMode("text");
              setMedia(null);
              setPreviewUrl(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded ${
              mode === "text" ? "bg-white text-black" : "bg-zinc-800"
            }`}
          >
            <TextIcon size={18} /> Text
          </button>
          <label
            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded cursor-pointer ${
              mode === "media" ? "bg-white text-black" : "bg-zinc-800"
            }`}
          >
            <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" />
            <Upload size={18} /> Photo/Video
          </label>
        </div>

        {/* Submit */}
        <button
          // onClick={() => toast.promise(handleCreateStory(), { loading: "Saving..." })}
          className="flex items-center justify-center gap-2 text-white py-3 mt-4 w-full rounded bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:scale-95 transition"
        >
          <Sparkle size={18} /> Create Story
        </button>
      </div>
    </div>
  );
};

export default StoryModal;
