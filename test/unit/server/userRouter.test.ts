import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { listModelsMock } = vi.hoisted(() => ({
  listModelsMock: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    models = { list: listModelsMock };
    constructor() {}
  },
}));

import { userRouter } from '@/server/routers/user';

function createAuthedCaller() {
  const user = {
    id: '00000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'tester@example.com',
  } as User;

  return userRouter.createCaller({ user });
}

describe('userRouter.testApiKey', () => {
  beforeEach(() => {
    listModelsMock.mockReset();
  });

  it('accepts stability keys as valid but unverified', async () => {
    const caller = createAuthedCaller();
    const result = await caller.testApiKey({
      provider: 'stability',
      apiKey: 'stability-test-key',
    });

    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
        verified: false,
      })
    );
    expect(result.message).toContain('unverified');
  });

  it('marks openai keys as verified when model listing succeeds', async () => {
    listModelsMock.mockResolvedValueOnce({ data: [] });

    const caller = createAuthedCaller();
    const result = await caller.testApiKey({
      provider: 'openai',
      apiKey: 'openai-test-key',
    });

    expect(listModelsMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        valid: true,
        verified: true,
      })
    );
  });
});
