/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'render.worldofwarcraft.com',
      },
      {
        protocol: 'https',
        hostname: 'wow.zamimg.com',
      },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'pg'],
  },
};

export default nextConfig;
