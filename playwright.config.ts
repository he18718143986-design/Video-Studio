import { defineConfig } from '@playwright/test';

const isLive = process.env.PLAYWRIGHT_LIVE === '1';
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: isLive ? 60_000 : 45_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: isLive
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`,
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: false,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'e2e-anon-key',
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'e2e-service-role-key',
          ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          E2E_BYPASS_AUTH: '1',
          E2E_BYPASS_GUARD: 'allow-non-production',
        },
      },
});
