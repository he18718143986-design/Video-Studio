import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateKeyframes } from '@/services/production';
import { getProjectData, getUserProviders, updateProject, upsertScenes } from './helpers';
import type { StyleDNA, Storyboard } from '@/lib/types';

export const step9Keyframes = inngest.createFunction(
  { id: 'step-9-keyframes', retries: 2 },
  { event: 'pipeline/step-9.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 9, 'Scene Keyframe Generation', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;
      const storyboard = project.storyboard as Storyboard;

      const keyframeResults = await generateKeyframes(
        storyboard.scenes,
        styleDNA,
        project.reference_sheet_url ?? undefined,
        projectId,
        availableProviders,
        apiKeys
      );

      const totalCost = keyframeResults.reduce((sum, r) => sum + r.costUsd, 0);
      return { keyframeResults, totalCost };
    });

    await step.run('persist', async () => {
      const sceneUpdates = result.keyframeResults.map((r) => ({
        scene_index: r.sceneIndex,
        keyframe_url: r.keyframeUrl,
        status: 'generating_video',
      }));

      await upsertScenes(projectId, sceneUpdates);
      await updateProject(projectId, { status: 'step_9', current_step: 9 });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 9, 'Scene Keyframe Generation', 'completed', {
        costUsd: result.totalCost,
      });
    });

    await inngest.send({ name: 'pipeline/step-10.requested', data: { projectId } });

    return result;
  }
);
