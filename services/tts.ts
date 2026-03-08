import type { StoryboardScene, Provider } from '@/lib/types';
import { selectModel } from './modelRegistry';
import { synthesizeSpeech } from './adapters/ttsAdapter';
import { uploadBuffer } from '@/lib/gcs';
import { PromisePool } from '@/lib/utils';
import { calculateCost } from './observability';

export async function generateSceneTTS(
  scenes: StoryboardScene[],
  language: string,
  projectId: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<Array<{ sceneIndex: number; audioUrl: string; audioDurationSec: number; costUsd: number }>> {
  const { provider, model } = selectModel('step_11_tts', availableProviders);
  const pool = new PromisePool(3);

  const results: Array<{ sceneIndex: number; audioUrl: string; audioDurationSec: number; costUsd: number }> = [];

  const tasks = scenes.map((scene) =>
    pool.add(async () => {
      const { audioBuffer, durationSec } = await synthesizeSpeech({
        text: scene.voiceover,
        language,
        provider,
        model,
        apiKey: apiKeys?.[provider],
      });

      const gcsPath = `projects/${projectId}/audio/scene_${scene.sceneIndex}.mp3`;
      const audioUrl = await uploadBuffer(audioBuffer, gcsPath, 'audio/mpeg');

      const costUsd = calculateCost(model, { characterCount: scene.voiceover.length });

      return {
        sceneIndex: scene.sceneIndex,
        audioUrl,
        audioDurationSec: durationSec,
        costUsd,
      };
    })
  );

  const taskResults = await Promise.all(tasks);
  results.push(...taskResults);

  return results;
}
