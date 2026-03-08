import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { runQAAudit } from '@/services/scripting';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { StyleDNA, ResearchReport, Script } from '@/lib/types';

export const step6QaAudit = inngest.createFunction(
  { id: 'step-6-qa-audit', retries: 3 },
  { event: 'pipeline/step-6.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 6, 'QA Audit & Safety Re-check', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const script = project.script as Script;
      const researchReport = project.research_report as ResearchReport;
      const styleDNA = project.style_dna as StyleDNA;

      const { result, costUsd, model } = await runQAAudit(
        script,
        researchReport,
        styleDNA,
        availableProviders,
        apiKeys
      );

      return { result, costUsd, model };
    });

    await step.run('persist', async () => {
      if (!result.result.safetyPass) {
        await updateProject(projectId, {
          status: 'failed',
          error_message: `Safety audit failed: ${result.result.issues.join('; ')}`,
        });
      } else if (result.result.revisedScript) {
        await updateProject(projectId, {
          script: result.result.revisedScript,
          status: 'step_6',
          current_step: 6,
        });
      } else {
        await updateProject(projectId, { status: 'step_6', current_step: 6 });
      }
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(
        projectId, 6, 'QA Audit & Safety Re-check',
        result.result.safetyPass ? 'completed' : 'failed',
        { costUsd: result.costUsd, modelUsed: result.model }
      );
    });

    if (result.result.safetyPass) {
      await inngest.send({ name: 'pipeline/step-7.requested', data: { projectId } });
    }

    return result;
  }
);
