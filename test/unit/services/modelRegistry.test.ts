import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Provider } from '@/lib/types';

vi.mock('@/services/modelDiscovery', () => ({
  getDiscoveredModelsSnapshot: vi.fn(),
}));

import { getDiscoveredModelsSnapshot } from '@/services/modelDiscovery';
import { getAvailableProvidersFromKeys, selectModel } from '@/services/modelRegistry';

const mockedGetDiscoveredModelsSnapshot = vi.mocked(getDiscoveredModelsSnapshot);

const PROVIDER_ENV_KEYS = [
  'GOOGLE_AI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ELEVENLABS_API_KEY',
  'STABILITY_API_KEY',
  'KLING_API_KEY',
  'RUNWAY_API_KEY',
] as const;

const ORIGINAL_PROVIDER_ENV = Object.fromEntries(
  PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]])
) as Record<(typeof PROVIDER_ENV_KEYS)[number], string | undefined>;

const NO_PROVIDERS: Record<Provider, boolean> = {
  google: false,
  openai: false,
  anthropic: false,
  elevenlabs: false,
  stability: false,
  kling: false,
  runway: false,
};

describe('modelRegistry', () => {
  beforeEach(() => {
    mockedGetDiscoveredModelsSnapshot.mockReset();
    mockedGetDiscoveredModelsSnapshot.mockReturnValue([]);

    for (const key of PROVIDER_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      const previous = ORIGINAL_PROVIDER_ENV[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('chooses preferred google fallback model for style-dna extraction', () => {
    const selected = selectModel('step_2b_style_dna', {
      ...NO_PROVIDERS,
      google: true,
    });

    expect(selected).toEqual({
      provider: 'google',
      model: 'gemini-1.5-pro',
    });
  });

  it('prefers highest-ranked discovered anthropic model for text reasoning', () => {
    mockedGetDiscoveredModelsSnapshot.mockImplementation((provider) => {
      if (provider !== 'anthropic') return [];
      return [
        {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          capabilities: ['text_reasoning'],
          isAvailable: true,
          source: 'user',
          fetchedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          provider: 'anthropic',
          model: 'claude-sonnet-4-5',
          capabilities: ['text_reasoning'],
          isAvailable: true,
          source: 'user',
          fetchedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
    });

    const selected = selectModel('step_4_narrative_map', {
      ...NO_PROVIDERS,
      anthropic: true,
    });

    expect(selected).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });
  });

  it('merges BYOK providers with platform environment keys', () => {
    process.env.OPENAI_API_KEY = 'platform-openai-key';

    const available = getAvailableProvidersFromKeys([{ provider: 'google' }]);

    expect(available.google).toBe(true);
    expect(available.openai).toBe(true);
    expect(available.anthropic).toBe(false);
    expect(available.kling).toBe(false);
  });
});
