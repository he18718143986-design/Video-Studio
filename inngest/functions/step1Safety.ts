import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { runSafetyCheck } from '@/services/safety';
import { getProjectData, getUserProviders, updateProject } from './helpers';

export const step1Safety = inngest.createFunction(
  { id: 'step-1-safety', retries: 3 },
  { event: 'pipeline/step-1.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 1, 'Safety Pre-check', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);

      const { result, costUsd, model } = await runSafetyCheck(
        project.new_topic,
        availableProviders,
        apiKeys
      );

      return { result, costUsd, model };
    });

    await step.run('persist', async () => {
      if (result.result.isFlagged) {
        await updateProject(projectId, {
          status: 'failed',
          error_message: `Topic flagged: ${result.result.reason}. Safe alternative: ${result.result.safeAlternative ?? 'N/A'}`,
        });
      } else {
        await updateProject(projectId, { status: 'step_1', current_step: 1 });
      }
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(
        projectId, 1, 'Safety Pre-check',
        result.result.isFlagged ? 'failed' : 'completed',
        { costUsd: result.costUsd, modelUsed: result.model }
      );
    });

    if (!result.result.isFlagged) {
      await inngest.send({ name: 'pipeline/step-2a.requested', data: { projectId } });
    }

    return result;
  }
);
