import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
      allowedOrigins: ['localhost:3000', 'civiltracker.buildogram.in', 'civil-tracker.vercel.app'],
    },
    // Disable client-side router cache so charts/data always show fresh on navigation
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
}

export default nextConfig
