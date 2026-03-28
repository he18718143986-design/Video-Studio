import { describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: mocks.fromMock,
  },
}));

import { pipelineRouter } from '@/server/routers/pipeline';
import { projectRouter } from '@/server/routers/project';
import { sceneRouter } from '@/server/routers/scene';

function createAuthedUser(id = 'user-1'): User {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.com`,
  } as User;
}

function createSingleBuilder<T>(result: { data: T; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function createOrderedBuilder<T>(result: { data: T; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
}

describe('router integration', () => {
  it('project.get returns owner project and applies user_id filter', async () => {
    const user = createAuthedUser('owner-1');
    const projectId = '11111111-1111-4111-8111-111111111111';
    const project = { id: projectId, title: 'owner project' };
    const projectBuilder = createSingleBuilder({ data: project, error: null });

    mocks.fromMock.mockReset();
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'projects') return projectBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const caller = projectRouter.createCaller({ user });
    const result = await caller.get({ id: projectId });

    expect(result).toEqual(project);
    expect(projectBuilder.eq).toHaveBeenNthCalledWith(1, 'id', projectId);
    expect(projectBuilder.eq).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('scene.list blocks access when project ownership check fails', async () => {
    const user = createAuthedUser('owner-2');
    const projectId = '22222222-2222-4222-8222-222222222222';
    const projectBuilder = createSingleBuilder({
      data: null,
      error: null,
    });

    mocks.fromMock.mockReset();
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'projects') return projectBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const caller = sceneRouter.createCaller({ user });
    await expect(caller.list({ projectId })).rejects.toThrow('Project not found');
    expect(projectBuilder.eq).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('pipeline.getStatus returns status only for owner project', async () => {
    const user = createAuthedUser('owner-3');
    const projectId = '33333333-3333-4333-8333-333333333333';
    const projectBuilder = createSingleBuilder({
      data: {
        status: 'step_5',
        current_step: 5,
        total_cost_usd: 1.2345,
        error_message: null,
      },
      error: null,
    });

    mocks.fromMock.mockReset();
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'projects') return projectBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const caller = pipelineRouter.createCaller({ user });
    const result = await caller.getStatus({ projectId });

    expect(result).toEqual({
      status: 'step_5',
      current_step: 5,
      total_cost_usd: 1.2345,
      error_message: null,
    });
    expect(projectBuilder.eq).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('pipeline.getStatus enforces auth middleware', async () => {
    const projectId = '44444444-4444-4444-8444-444444444444';
    const caller = pipelineRouter.createCaller({ user: null });

    await expect(caller.getStatus({ projectId })).rejects.toThrow('Not authenticated');
  });

  it('scene.list returns scenes in order for owner project', async () => {
    const user = createAuthedUser('owner-4');
    const projectId = '55555555-5555-4555-8555-555555555555';
    const projectBuilder = createSingleBuilder({
      data: { id: projectId },
      error: null,
    });
    const scenesBuilder = createOrderedBuilder({
      data: [
        { scene_index: 0, status: 'pending' },
        { scene_index: 1, status: 'rendered' },
      ],
      error: null,
    });

    mocks.fromMock.mockReset();
    mocks.fromMock.mockImplementation((table: string) => {
      if (table === 'projects') return projectBuilder;
      if (table === 'scenes') return scenesBuilder;
      throw new Error(`Unexpected table: ${table}`);
    });

    const caller = sceneRouter.createCaller({ user });
    const result = await caller.list({ projectId });

    expect(result).toHaveLength(2);
    expect(scenesBuilder.order).toHaveBeenCalledWith('scene_index');
  });
});
