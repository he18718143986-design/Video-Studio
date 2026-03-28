import { supabaseAdmin } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import type { Provider } from '@/lib/types';
import { getAvailableProvidersFromKeys } from '@/services/modelRegistry';
import { refreshModelDiscovery } from '@/services/modelDiscovery';

export async function getProjectData(projectId: string) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error || !data) throw new Error(`Project not found: ${projectId}`);
  return data;
}

export async function getUserProviders(projectId: string): Promise<{
  availableProviders: Record<Provider, boolean>;
  apiKeys: Record<string, string>;
}> {
  const project = await getProjectData(projectId);

  const apiKeys: Record<string, string> = {};
  const keySources: Partial<Record<Provider, 'user' | 'platform'>> = {};

  // Platform-level keys from environment (admin-configured, shared by all users)
  if (process.env.GOOGLE_AI_API_KEY) {
    apiKeys['google'] = process.env.GOOGLE_AI_API_KEY;
    keySources['google'] = 'platform';
  }
  if (process.env.OPENAI_API_KEY) {
    apiKeys['openai'] = process.env.OPENAI_API_KEY;
    keySources['openai'] = 'platform';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    apiKeys['anthropic'] = process.env.ANTHROPIC_API_KEY;
    keySources['anthropic'] = 'platform';
  }
  if (process.env.ELEVENLABS_API_KEY) {
    apiKeys['elevenlabs'] = process.env.ELEVENLABS_API_KEY;
    keySources['elevenlabs'] = 'platform';
  }
  if (process.env.STABILITY_API_KEY) {
    apiKeys['stability'] = process.env.STABILITY_API_KEY;
    keySources['stability'] = 'platform';
  }
  if (process.env.KLING_API_KEY) {
    apiKeys['kling'] = process.env.KLING_API_KEY;
    keySources['kling'] = 'platform';
  }
  if (process.env.RUNWAY_API_KEY) {
    apiKeys['runway'] = process.env.RUNWAY_API_KEY;
    keySources['runway'] = 'platform';
  }

  // User-level keys override platform keys (user can bring their own)
  const { data: keys } = await supabaseAdmin
    .from('user_api_keys')
    .select('provider, encrypted_key')
    .eq('user_id', project.user_id);

  if (keys) {
    for (const key of keys) {
      try {
        apiKeys[key.provider] = decrypt(key.encrypted_key);
        keySources[key.provider as Provider] = 'user';
      } catch {
        // Skip invalid keys, platform key remains as fallback
      }
    }
  }

  // `getAvailableProvidersFromKeys` merges user keys with platform env keys.
  const providerList = (keys ?? []).map((k) => ({ provider: k.provider as Provider }));
  const availableProviders = getAvailableProvidersFromKeys(providerList);

  // Preload model capabilities (dynamic discovery) for providers with active keys.
  await refreshModelDiscovery({
    apiKeys: apiKeys as Partial<Record<Provider, string>>,
    sources: keySources,
  });

  return { availableProviders, apiKeys };
}

export async function updateProject(projectId: string, data: Record<string, unknown>) {
  await supabaseAdmin
    .from('projects')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

export async function upsertScenes(
  projectId: string,
  scenes: Array<Record<string, unknown>>
) {
  for (const scene of scenes) {
    const { data: existing } = await supabaseAdmin
      .from('scenes')
      .select('id')
      .eq('project_id', projectId)
      .eq('scene_index', scene['scene_index'])
      .single();

    if (existing) {
      await supabaseAdmin
        .from('scenes')
        .update(scene)
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('scenes')
        .insert({ project_id: projectId, ...scene });
    }
  }
}
