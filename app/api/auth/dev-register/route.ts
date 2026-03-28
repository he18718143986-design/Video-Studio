import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase';
import { isDevDirectRegisterAllowed } from '@/lib/devAuth';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(6).max(128),
  displayName: z.string().min(1).max(100),
});

function getHostHeader(request: NextRequest): string | null {
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost?.trim()) return forwardedHost.trim();

  const host = request.headers.get('host');
  return host?.trim() ? host.trim() : null;
}

export async function POST(request: NextRequest) {
  if (!isDevDirectRegisterAllowed(getHostHeader(request))) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid registration payload.' },
      { status: 400 }
    );
  }

  const { email, password, displayName } = parsed.data;
  const supabase = createServiceRoleClient();

  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
