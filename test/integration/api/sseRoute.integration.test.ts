import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  fromMock: vi.fn(),
  channelMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClientMock,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: mocks.fromMock,
    channel: mocks.channelMock,
  },
}));

import { GET } from '@/app/api/sse/[projectId]/route';

const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createFakeRequest(url = 'http://localhost/api/sse/project-1') {
  const controller = new AbortController();
  const request = {
    headers: new Headers(),
    cookies: { getAll: () => [] },
    signal: controller.signal,
    url,
  } as unknown as NextRequest;

  return { request, controller };
}

function createProjectLookupBuilder(result: {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function createEventsLookupBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
}

describe('SSE route integration', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    mocks.createServerClientMock.mockReset();
    mocks.fromMock.mockReset();
    mocks.channelMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_URL === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_URL;
    }

    if (ORIGINAL_ANON === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_ANON;
    }
  });

  it('returns 401 for unauthenticated requests', async () => {
    mocks.createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const { request } = createFakeRequest();
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 404 when project is not owned by current user', async () => {
    const user = { id: 'user-owned-check' };
    const projectBuilder = createProjectLookupBuilder({
      data: null,
      error: { message: 'Project not found' },
    });

    mocks.createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
    });
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'projects') return projectBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const { request } = createFakeRequest();
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'project-2' }),
    });

    expect(response.status).toBe(404);
    expect(projectBuilder.eq).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('returns event-stream response for owner and registers scoped filters', async () => {
    const user = { id: 'user-owner' };
    const projectBuilder = createProjectLookupBuilder({
      data: {
        id: 'project-3',
        status: 'step_2',
        current_step: 2,
        total_cost_usd: 0.1234,
        final_video_url: null,
      },
      error: null,
    });
    const eventsBuilder = createEventsLookupBuilder();
    const unsubscribeMock = vi.fn();
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((() => 1) as unknown as typeof setInterval);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);

    const channelChain = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: unsubscribeMock }),
    };

    mocks.createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: null,
        }),
      },
    });
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'projects') return projectBuilder;
      if (table === 'pipeline_events') return eventsBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });
    mocks.channelMock.mockReturnValue(channelChain);

    const { request, controller } = createFakeRequest('http://localhost/api/sse/project-3');
    const response = await GET(request, {
      params: Promise.resolve({ projectId: 'project-3' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(projectBuilder.eq).toHaveBeenNthCalledWith(2, 'user_id', user.id);
    expect(eventsBuilder.eq).toHaveBeenCalledWith('project_id', 'project-3');

    controller.abort();
    await Promise.resolve();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    setIntervalSpy.mockRestore();
  });
});
