import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { runCapabilityAssessment } from '@/services/analysis';
import { getUserProviders, updateProject } from './helpers';

export const step2aCapabilityAssessment = inngest.createFunction(
  { id: 'step-2a-capability-assessment', retries: 3 },
  { event: 'pipeline/step-2a.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 2, 'Capability Self-Assessment', 'started');
    });

    const result = await step.run('execute', async () => {
      const { availableProviders, apiKeys } = await getUserProviders(projectId);

      const { assessment, costUsd, model } = await runCapabilityAssessment(
        availableProviders,
        apiKeys
      );

      return { assessment, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        capability_assessment: result.assessment,
        current_step: 2,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 2, 'Capability Self-Assessment', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-2b.requested', data: { projectId } });

    return result;
  }
);
