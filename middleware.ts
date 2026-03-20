import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/api/trpc', '/api/inngest', '/api/sse', '/api/health'];

const RATE_LIMIT_MAP = new Map<string, { count: number; resetTime: number }>();
const API_RATE_LIMIT = { maxRequests: 120, windowMs: 60_000 };
const AUTH_RATE_LIMIT = { maxRequests: 15, windowMs: 60_000 };

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  return ip;
}

function checkRateLimit(key: string, limit: { maxRequests: number; windowMs: number }): {
  allowed: boolean;
  remaining: number;
} {
  const now = Date.now();
  const entry = RATE_LIMIT_MAP.get(key);

  if (!entry || now > entry.resetTime) {
    RATE_LIMIT_MAP.set(key, { count: 1, resetTime: now + limit.windowMs });
    return { allowed: true, remaining: limit.maxRequests - 1 };
  }

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + limit.windowMs;
    return { allowed: true, remaining: limit.maxRequests - 1 };
  }

  entry.count++;
  if (entry.count > limit.maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: limit.maxRequests - entry.count };
}

function cleanupExpiredEntries() {
  const now = Date.now();
  if (RATE_LIMIT_MAP.size > 10000) {
    for (const [key, value] of RATE_LIMIT_MAP) {
      if (now > value.resetTime) RATE_LIMIT_MAP.delete(key);
    }
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
  const isStaticAsset = pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.');

  if (isStaticAsset) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    cleanupExpiredEntries();

    const ip = getRateLimitKey(request);
    const isAuthPath = pathname === '/login' || pathname === '/register';
    const limit = isAuthPath ? AUTH_RATE_LIMIT : API_RATE_LIMIT;
    const prefixedKey = `${isAuthPath ? 'auth' : 'api'}:${ip}`;
    const { allowed, remaining } = checkRateLimit(prefixedKey, limit);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    if (!pathname.startsWith('/api/trpc') && !pathname.startsWith('/api/sse')) {
      return response;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!isPublicPath) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isPublicPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user && (pathname === '/login' || pathname === '/register')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } catch {
    if (!isPublicPath) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
