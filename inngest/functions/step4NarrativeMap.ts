import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateNarrativeMap } from '@/services/scripting';
import { getProjectData, getUserProviders, updateProject } from './helpers';
import type { StyleDNA, ResearchReport } from '@/lib/types';

export const step4NarrativeMap = inngest.createFunction(
  { id: 'step-4-narrative-map', retries: 3 },
  { event: 'pipeline/step-4.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 4, 'Narrative Map Generation', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;
      const researchReport = project.research_report as ResearchReport;
      const language = styleDNA.scriptPipeline?.language ?? project.language ?? 'en-US';

      const { narrativeMap, costUsd, model } = await generateNarrativeMap(
        researchReport,
        styleDNA,
        project.target_duration_sec ?? 120,
        language,
        availableProviders,
        apiKeys
      );

      return { narrativeMap, costUsd, model };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        narrative_map: result.narrativeMap,
        status: 'step_4',
        current_step: 4,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 4, 'Narrative Map Generation', 'completed', {
        costUsd: result.costUsd,
        modelUsed: result.model,
      });
    });

    await inngest.send({ name: 'pipeline/step-5.requested', data: { projectId } });

    return result;
  }
);
