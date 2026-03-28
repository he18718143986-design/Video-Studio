import type { NextConfig } from "next";

const isStandalone = process.env.DOCKER_BUILD === '1';

function parseDevOriginHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const candidate = trimmed.includes('://') ? trimmed : `http://${trimmed}`;
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const envAllowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map(parseDevOriginHost)
  .filter((origin): origin is string => Boolean(origin));

const appUrlOrigin = parseDevOriginHost(process.env.NEXT_PUBLIC_APP_URL ?? '');

const allowedDevOrigins = Array.from(
  new Set(appUrlOrigin ? [...envAllowedDevOrigins, appUrlOrigin] : envAllowedDevOrigins)
);

const nextConfig: NextConfig = {
  ...(isStandalone ? { output: 'standalone' } : {}),
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: allowedDevOrigins.length > 0 ? allowedDevOrigins : undefined,

  serverExternalPackages: ['fluent-ffmpeg'],

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
