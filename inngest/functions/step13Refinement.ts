import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { refine } from '@/services/refinement';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { StyleDNA, Script, Storyboard, RefinementMode } from '@/lib/types';

export const step13Refinement = inngest.createFunction(
  { id: 'step-13-refinement', retries: 3 },
  { event: 'pipeline/step-13.requested' },
  async ({ event, step }) => {
    const { projectId, mode, feedback, sceneIndex } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 13, 'Refinement', 'started', {
        message: `Mode: ${mode}`,
      });
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;

      const refinementResult = await refine(
        {
          mode: mode as RefinementMode,
          script: project.script as Script | undefined,
          storyboard: project.storyboard as Storyboard | undefined,
          styleDNA,
          feedback,
          sceneIndex,
        },
        availableProviders,
        apiKeys
      );

      return refinementResult;
    });

    await step.run('persist', async () => {
      const updates: Record<string, unknown> = {};

      if (result.updatedScript) {
        updates['script'] = result.updatedScript;
      }
      if (result.updatedStoryboard) {
        updates['storyboard'] = result.updatedStoryboard;
      }

      if (Object.keys(updates).length > 0) {
        await updateProject(projectId, updates);
      }
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 13, 'Refinement', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
        message: `Affected scenes: ${result.affectedSceneIndices.join(', ')}`,
      });
    });

    if (result.affectedSceneIndices.length > 0 && (mode === 'full_script' || mode === 'single_scene')) {
      await inngest.send({ name: 'pipeline/step-11.requested', data: { projectId } });
    }

    return result;
  }
);
