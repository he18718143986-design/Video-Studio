import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '@/server';
import { createBrowserSupabaseClient } from '@/lib/supabase';

export function createBrowserTrpcClient() {
  const supabase = createBrowserSupabaseClient();

  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        transformer: superjson,
        headers: async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const token = session?.access_token;

          if (!token) return {};
          return {
            Authorization: `Bearer ${token}`,
            'x-supabase-access-token': token,
          };
        },
      }),
    ],
  });
}
