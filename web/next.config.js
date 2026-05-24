/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow importing parent CommonJS modules (axios, dotenv, etc.) without bundling
    serverComponentsExternalPackages: ['axios', 'dotenv'],
  },
};

module.exports = nextConfig;
