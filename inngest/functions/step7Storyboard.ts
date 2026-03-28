import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateStoryboard } from '@/services/storyboard';
import { getProjectData, getUserProviders, updateProject, upsertScenes } from './helpers';
import type { StyleDNA, Script } from '@/lib/types';

export const step7Storyboard = inngest.createFunction(
  { id: 'step-7-storyboard', retries: 3 },
  { event: 'pipeline/step-7.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 7, 'Storyboard Generation', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const script = project.script as Script;
      const styleDNA = project.style_dna as StyleDNA;

      const { storyboard, costUsd, model } = await generateStoryboard(
        script,
        styleDNA,
        availableProviders,
        apiKeys
      );

      return { storyboard, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        storyboard: result.storyboard,
        status: 'step_7',
        current_step: 7,
      });

      const sceneRecords = result.storyboard.scenes.map((s) => ({
        scene_index: s.sceneIndex,
        beat: s.beat,
        voiceover_text: s.voiceover,
        visual_prompt: s.visualPrompt,
        camera_motion: s.cameraMotion,
        key_elements: s.keyElements,
        estimated_duration_sec: s.estimatedDurationSec,
        status: 'pending',
      }));

      await upsertScenes(projectId, sceneRecords);
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 7, 'Storyboard Generation', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-8.requested', data: { projectId } });

    return result;
  }
);
