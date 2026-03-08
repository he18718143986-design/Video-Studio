import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateReferenceSheet } from '@/services/production';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { StyleDNA } from '@/lib/types';

export const step8ReferenceSheet = inngest.createFunction(
  { id: 'step-8-reference-sheet', retries: 2 },
  { event: 'pipeline/step-8.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 8, 'Style Reference Sheet', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;

      const { referenceSheetUrl, costUsd, model } = await generateReferenceSheet(
        styleDNA,
        projectId,
        availableProviders,
        apiKeys
      );

      return { referenceSheetUrl, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        reference_sheet_url: result.referenceSheetUrl,
        status: 'step_8',
        current_step: 8,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 8, 'Style Reference Sheet', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-9.requested', data: { projectId } });

    return result;
  }
);
