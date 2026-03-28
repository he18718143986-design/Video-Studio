import type { Capability, Provider } from '@/lib/types';
import OpenAI from 'openai';
import { getRedisClient } from '@/lib/redis';

export interface DiscoveredModel {
  provider: Provider;
  model: string;
  capabilities: Capability[];
  isAvailable: boolean;
  source: 'user' | 'platform' | 'unknown';
  fetchedAt: string;
}

interface CacheEntry {
  models: DiscoveredModel[];
  expiresAt: number;
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const REDIS_TTL_SECONDS = Math.floor(DISCOVERY_TTL_MS / 1000);
const cache = new Map<string, CacheEntry>();
const latestByProvider = new Map<Provider, DiscoveredModel[]>();

function cacheKey(provider: Provider, apiKey?: string): string {
  if (!apiKey) return `${provider}:none`;
  const suffix = apiKey.slice(-8);
  return `${provider}:${suffix}`;
}

function setProviderSnapshot(provider: Provider, models: DiscoveredModel[]) {
  latestByProvider.set(provider, models);
}

export function getDiscoveredModelsSnapshot(provider: Provider): DiscoveredModel[] {
  return latestByProvider.get(provider) ?? [];
}

export async function discoverModels(
  provider: Provider,
  apiKey?: string,
  source: 'user' | 'platform' | 'unknown' = 'unknown'
): Promise<DiscoveredModel[]> {
  if (!apiKey) return [];

  const key = cacheKey(provider, apiKey);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    setProviderSnapshot(provider, cached.models);
    return cached.models;
  }

  const redisCached = await readRedisCache(key);
  if (redisCached) {
    cache.set(key, { models: redisCached, expiresAt: now + DISCOVERY_TTL_MS });
    setProviderSnapshot(provider, redisCached);
    return redisCached;
  }

  let models: DiscoveredModel[] = [];
  try {
    switch (provider) {
      case 'google':
        models = await discoverGoogleModels(apiKey, source);
        break;
      case 'openai':
        models = await discoverOpenAIModels(apiKey, source);
        break;
      case 'anthropic':
        models = await discoverAnthropicModels(apiKey, source);
        break;
      default:
        models = [];
    }
  } catch (error) {
    console.warn(`[modelDiscovery] Failed to discover ${provider} models`, error);
    models = [];
  }

  cache.set(key, { models, expiresAt: now + DISCOVERY_TTL_MS });
  await writeRedisCache(key, models);
  setProviderSnapshot(provider, models);
  return models;
}

export async function refreshModelDiscovery(params: {
  apiKeys: Partial<Record<Provider, string>>;
  sources?: Partial<Record<Provider, 'user' | 'platform'>>;
}): Promise<void> {
  const providers = Object.keys(params.apiKeys) as Provider[];
  await Promise.all(
    providers.map(async (provider) => {
      const apiKey = params.apiKeys[provider];
      if (!apiKey) return;
      const source = params.sources?.[provider] ?? 'unknown';
      await discoverModels(provider, apiKey, source);
    })
  );
}

async function discoverGoogleModels(
  apiKey: string,
  source: 'user' | 'platform' | 'unknown'
): Promise<DiscoveredModel[]> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!response.ok) return [];

  const data = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  const fetchedAt = new Date().toISOString();

  return (data.models ?? []).reduce<DiscoveredModel[]>((models, m) => {
      const model = m.name?.replace(/^models\//, '') ?? '';
      if (!model) return models;

      const discoveredModel: DiscoveredModel = {
        provider: 'google' as const,
        model,
        capabilities: inferGoogleCapabilities(model, m.supportedGenerationMethods ?? []),
        isAvailable: true,
        source,
        fetchedAt,
      };

      if (discoveredModel.capabilities.length > 0) {
        models.push(discoveredModel);
      }

      return models;
    }, []);
}

async function discoverOpenAIModels(
  apiKey: string,
  source: 'user' | 'platform' | 'unknown'
): Promise<DiscoveredModel[]> {
  const client = new OpenAI({ apiKey });
  const list = await client.models.list();
  const fetchedAt = new Date().toISOString();

  return list.data
    .map((m) => ({
      provider: 'openai' as const,
      model: m.id,
      capabilities: inferOpenAICapabilities(m.id),
      isAvailable: true,
      source,
      fetchedAt,
    }))
    .filter((item) => item.capabilities.length > 0);
}

async function discoverAnthropicModels(
  apiKey: string,
  source: 'user' | 'platform' | 'unknown'
): Promise<DiscoveredModel[]> {
  const response = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!response.ok) return [];

  const data = (await response.json()) as { data?: Array<{ id: string }> };
  const fetchedAt = new Date().toISOString();

  return (data.data ?? [])
    .map((m) => ({
      provider: 'anthropic' as const,
      model: m.id,
      capabilities: inferAnthropicCapabilities(m.id),
      isAvailable: true,
      source,
      fetchedAt,
    }))
    .filter((item) => item.capabilities.length > 0);
}

function inferGoogleCapabilities(model: string, methods: string[]): Capability[] {
  const lower = model.toLowerCase();
  const caps = new Set<Capability>();

  if (lower.includes('imagen')) caps.add('image_generation');
  if (lower.includes('veo')) caps.add('video_generation');
  if (lower.includes('tts') || lower.includes('speech')) caps.add('tts');

  if (lower.includes('gemini')) {
    caps.add('image_understanding');
    caps.add('text_reasoning');
    if (lower.includes('flash')) caps.add('fast_reasoning');
    if (lower.includes('pro') || lower.includes('1.5') || lower.includes('2.0') || lower.includes('2.5')) {
      caps.add('video_understanding');
      caps.add('fast_reasoning');
    }
  }

  if (methods.includes('generateContent') && !caps.has('text_reasoning')) {
    caps.add('text_reasoning');
  }
  if (methods.includes('predict') && lower.includes('imagen')) {
    caps.add('image_generation');
  }

  return Array.from(caps);
}

function inferOpenAICapabilities(model: string): Capability[] {
  const lower = model.toLowerCase();
  const caps = new Set<Capability>();

  if (lower.includes('dall-e') || lower.includes('gpt-image')) caps.add('image_generation');
  if (lower.startsWith('tts-') || lower.includes('gpt-4o-mini-tts')) caps.add('tts');
  if (lower.startsWith('gpt-') || lower.startsWith('o')) {
    caps.add('text_reasoning');
    caps.add('fast_reasoning');
    caps.add('image_understanding');
  }

  return Array.from(caps);
}

function inferAnthropicCapabilities(model: string): Capability[] {
  const lower = model.toLowerCase();
  if (!lower.includes('claude')) return [];

  const caps = new Set<Capability>(['text_reasoning', 'fast_reasoning']);
  if (lower.includes('opus') || lower.includes('sonnet') || lower.includes('3-5') || lower.includes('4')) {
    caps.add('image_understanding');
  }
  return Array.from(caps);
}

function redisDiscoveryKey(key: string): string {
  return `model-discovery:${key}`;
}

async function readRedisCache(key: string): Promise<DiscoveredModel[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    const raw = await redis.get(redisDiscoveryKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiscoveredModel[];
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn('[modelDiscovery] Redis read failed', error);
    return null;
  }
}

async function writeRedisCache(key: string, models: DiscoveredModel[]): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.set(redisDiscoveryKey(key), JSON.stringify(models), 'EX', REDIS_TTL_SECONDS);
  } catch (error) {
    console.warn('[modelDiscovery] Redis write failed', error);
  }
}
