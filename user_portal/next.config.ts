import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image optimization - allow external images if needed
  images: {
    remotePatterns: [],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL}/api/:path*`, // Proxy to backend API
      },
      {
        source: "/uploads/:path*",
        destination: `${process.env.BACKEND_URL}/uploads/:path*`, 
      },
    ];
  }
};

export default nextConfig;
