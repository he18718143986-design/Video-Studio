import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateScript } from '@/services/scripting';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { StyleDNA, NarrativeMap } from '@/lib/types';

export const step5Script = inngest.createFunction(
  { id: 'step-5-script', retries: 3 },
  { event: 'pipeline/step-5.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 5, 'Script Draft Generation', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;
      const narrativeMap = project.narrative_map as NarrativeMap;
      const language = styleDNA.scriptPipeline?.language ?? project.language ?? 'en-US';

      const { script, costUsd, model } = await generateScript(
        narrativeMap,
        styleDNA,
        language,
        availableProviders,
        apiKeys
      );

      return { script, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        script: result.script,
        status: 'step_5',
        current_step: 5,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 5, 'Script Draft Generation', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-6.requested', data: { projectId } });

    return result;
  }
);
