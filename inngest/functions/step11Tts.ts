import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateSceneTTS } from '@/services/tts';
import { getProjectData, getUserProviders, updateProject, upsertScenes } from './helpers';
import type { StyleDNA, Storyboard } from '@/lib/types';

export const step11Tts = inngest.createFunction(
  { id: 'step-11-tts', retries: 3 },
  { event: 'pipeline/step-11.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 11, 'TTS Voice Generation', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;
      const storyboard = project.storyboard as Storyboard;
      const language = styleDNA.scriptPipeline?.language ?? project.language ?? 'en-US';

      const ttsResults = await generateSceneTTS(
        storyboard.scenes,
        language,
        projectId,
        availableProviders,
        apiKeys
      );

      const totalCost = ttsResults.reduce((sum, r) => sum + r.costUsd, 0);
      return { ttsResults, totalCost };
    });

    await step.run('persist', async () => {
      const sceneUpdates = result.ttsResults.map((r) => ({
        scene_index: r.sceneIndex,
        audio_url: r.audioUrl,
        actual_audio_duration_sec: r.audioDurationSec,
        status: 'rendered',
      }));

      await upsertScenes(projectId, sceneUpdates);
      await updateProject(projectId, { status: 'step_11', current_step: 11 });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 11, 'TTS Voice Generation', 'completed', {
        costUsd: result.totalCost,
      });
    });

    await inngest.send({ name: 'pipeline/step-12.requested', data: { projectId } });

    return result;
  }
);
