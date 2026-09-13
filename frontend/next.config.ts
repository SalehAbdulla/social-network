import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { proxyClientMaxBodySize: "52mb" },
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:5174";
    return [
      { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
      { source: "/ws", destination: `${backend}/ws` },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "videos.pexels.com",
      },
    ],
  },
  allowedDevOrigins: ["127.0.0.1", "10.1.201.32", "local-origin.dev", "*.local-origin.dev"],
};

export default nextConfig;
