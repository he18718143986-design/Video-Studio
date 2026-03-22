import type { NextConfig } from "next";

const isStandalone = process.env.DOCKER_BUILD === '1';

const nextConfig: NextConfig = {
  ...(isStandalone ? { output: 'standalone' } : {}),

  serverExternalPackages: ['fluent-ffmpeg', '@google-cloud/storage'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/api/sse/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'Content-Type', value: 'text/event-stream' },
          { key: 'Connection', value: 'keep-alive' },
        ],
      },
    ];
  },
};

export default nextConfig;
