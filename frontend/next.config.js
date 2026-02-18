/** @type {import('next').NextConfig} */
const nextConfig = {
  // ==========================================================================
  // Next.js 14+ App Router Configuration
  // Optimized for Azure deployment with low-latency performance
  // Target: 500-800 users across India/US
  // ==========================================================================

  // Enable React strict mode for better error detection during development
  reactStrictMode: true,

  // Output standalone build for containerized Azure deployment
  output: 'standalone',

  // Environment variables exposed to the frontend
  env: {
    // Azure Functions backend URL - set during deployment
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api',
  },

  // Image optimization - disable for server-side rendering in Azure
  images: {
    unoptimized: false,
    domains: [],
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
