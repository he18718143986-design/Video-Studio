import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; message?: string }> = {};

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    const start = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        signal: AbortSignal.timeout(5000),
      });
      checks['supabase'] = {
        status: res.ok ? 'ok' : 'error',
        latencyMs: Date.now() - start,
      };
    } catch {
      checks['supabase'] = { status: 'error', latencyMs: Date.now() - start, message: 'Connection failed' };
    }
  } else {
    checks['supabase'] = { status: 'error', message: 'Not configured' };
  }

  checks['google_ai'] = {
    status: process.env.GOOGLE_AI_API_KEY ? 'ok' : 'error',
    message: process.env.GOOGLE_AI_API_KEY ? 'Key configured' : 'Not configured',
  };

  checks['encryption'] = {
    status: process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length === 64 ? 'ok' : 'error',
    message: process.env.ENCRYPTION_KEY?.length === 64 ? 'Valid' : 'Invalid or missing',
  };

  checks['ffmpeg'] = await checkFFmpeg();

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}

async function checkFFmpeg(): Promise<{ status: 'ok' | 'error'; message?: string }> {
  try {
    const { execSync } = await import('child_process');
    const output = execSync('ffmpeg -version', { timeout: 3000 }).toString();
    const version = output.split('\n')[0] ?? 'unknown';
    return { status: 'ok', message: version.trim() };
  } catch {
    return { status: 'error', message: 'FFmpeg not found' };
  }
}
