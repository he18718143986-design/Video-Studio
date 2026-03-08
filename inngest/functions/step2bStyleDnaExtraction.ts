import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { extractStyleDNA } from '@/services/analysis';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { CapabilityAssessment } from '@/lib/types';

export const step2bStyleDnaExtraction = inngest.createFunction(
  { id: 'step-2b-style-dna-extraction', retries: 3 },
  { event: 'pipeline/step-2b.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 2, 'Style DNA Extraction', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);

      const assessment = project.capability_assessment as CapabilityAssessment;
      if (!assessment) {
        throw new Error('Capability assessment not found. Step 2a must complete first.');
      }

      const videoUrl = project.reference_video_url ?? undefined;
      const videoPath = undefined;

      const { styleDNA, costUsd, model } = await extractStyleDNA(
        videoPath,
        videoUrl,
        assessment,
        availableProviders,
        apiKeys
      );

      return { styleDNA, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        style_dna: result.styleDNA,
        status: 'step_2',
        current_step: 2,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 2, 'Style DNA Extraction', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-3.requested', data: { projectId } });

    return result;
  }
);
