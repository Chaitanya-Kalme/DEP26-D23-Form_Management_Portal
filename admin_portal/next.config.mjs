/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing images from src/assets
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL}/api/:path*`, // Proxy to backend
      },
      {
        source: '/uploads/:path*',
        destination: `${process.env.BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
