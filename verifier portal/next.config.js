/** @type {import('next').NextConfig} */
const nextConfig = {
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
}
module.exports = nextConfig
