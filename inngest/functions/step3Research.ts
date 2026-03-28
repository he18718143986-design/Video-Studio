import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { runDeepResearch } from '@/services/research';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { StyleDNA } from '@/lib/types';

export const step3Research = inngest.createFunction(
  { id: 'step-3-research', retries: 3 },
  { event: 'pipeline/step-3.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 3, 'Deep Research', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;

      const { report, costUsd, model } = await runDeepResearch(
        project.new_topic,
        styleDNA,
        availableProviders,
        apiKeys
      );

      return { report, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        research_report: result.report,
        status: 'step_3',
        current_step: 3,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 3, 'Deep Research', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-4.requested', data: { projectId } });

    return result;
  }
);
