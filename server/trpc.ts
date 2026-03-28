import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { createServerSupabaseClient } from '@/lib/supabase';
import { type User } from '@supabase/supabase-js';

export interface Context {
  user: User | null;
}

export async function createContext(opts: { headers: Headers }): Promise<Context> {
  const supabase = createServerSupabaseClient();
  const authHeader = opts.headers.get('authorization');
  const customToken = opts.headers.get('x-supabase-access-token');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (customToken ?? null);

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    return { user };
  }

  return { user: null };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
