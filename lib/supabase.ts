import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

function getRequiredEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function getUrl(): string {
  return getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function getAnonKey(): string {
  return getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function getServiceRoleKey(): string {
  return getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(getUrl(), getAnonKey());
}

export function createServerSupabaseClient() {
  return createClient(getUrl(), getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createServiceRoleClient() {
  return createClient(getUrl(), getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let _supabaseAdmin: SupabaseClient | null = null;

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createClient(getUrl(), getServiceRoleKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (_supabaseAdmin as any)[prop];
    if (typeof value === 'function') {
      return value.bind(_supabaseAdmin);
    }
    return value;
  },
});
