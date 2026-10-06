"use client"

import React, { useState } from "react";
import { mediaImageProps } from "../lib/mediaVariants";

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

const COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-rose-500",
];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name.trim().slice(0, 2) || "?").toUpperCase();
}

const Avatar = ({ name, avatarUrl, size = 40, className = "" }: AvatarProps) => {
  const [failed, setFailed] = useState(false);

  if (avatarUrl && !failed) {
    return (
      <img
        {...mediaImageProps(avatarUrl, `${size}px`)}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const bg = hashColor(name);
  const fontSize = size >= 40 ? "text-sm" : "text-xs";

  return (
    <div
      className={`${bg} rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${fontSize} ${className}`}
      style={{ width: size, height: size }}
      title={name}
      role="img"
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
};

export default Avatar;