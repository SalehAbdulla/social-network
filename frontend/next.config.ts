import type { NextConfig } from "next";

/**
 * Where this build proxies API and WebSocket traffic to.
 *
 * The value is compiled into the rewrites, which is why it is checked here rather
 * than at request time: a production build that quietly fell back to loopback would
 * produce an image whose every request fails inside the container, with nothing in
 * the logs pointing at the cause. Development keeps the loopback fallback, and the
 * two CI workflows pass the variable, so only a deployment build can trip this.
 *
 * The shape is checked too, because both mistakes it catches are silent: a value
 * that is not an http(s) URL, and one with a trailing slash, which turns every
 * rewrite into `//api/v1/…`.
 */
function backendURL(): string {
  const configured = process.env.BACKEND_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "BACKEND_URL is not set. A production build compiles it into the rewrites, so the frontend would proxy to loopback inside its own container. Set it in the build environment (see DEPLOYMENT.md), or pass the Docker build argument BACKEND_URL.",
      );
    }
    return "http://127.0.0.1:5174";
  }
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(`BACKEND_URL is not a URL: ${configured}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`BACKEND_URL must be http or https, not ${parsed.protocol}//: ${configured}`);
  }
  if (configured.endsWith("/")) {
    throw new Error(`BACKEND_URL must not end with a slash: ${configured} (every rewrite would carry a double slash)`);
  }
  return configured;
}

const nextConfig: NextConfig = {
	output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: { proxyClientMaxBodySize: "52mb" },
  async rewrites() {
    const backend = backendURL();
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
  // The development indicator defaults to `bottom-left`, which is exactly where the rail's "More"
  // row sits, and it covered the hamburger with a circular Next.js mark. Measured at 1440x900 the
  // badge occupies (20, 844) 78x36 while the More row occupies (12, 844) 47x48, so the rail loses
  // that corner outright. Turning the indicator off leaves the corner to the rail: the badge stays
  // in the DOM but is `display: none`. The red "N Issue" pill the error overlay draws while a build
  // is failing is not part of the indicator and still lands bottom-left, so
  // `{ position: 'bottom-right' }` is worth reaching for instead if that shows up.
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "10.1.201.32", "local-origin.dev", "*.local-origin.dev"],
};

export default nextConfig;
