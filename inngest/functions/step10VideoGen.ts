import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { generateSceneVideos } from '@/services/production';
import { getProjectData, getUserProviders, updateProject, upsertScenes } from './helpers';
import type { StyleDNA, Storyboard, QualitySetting } from '@/lib/types';

export const step10VideoGen = inngest.createFunction(
  { id: 'step-10-video-gen', retries: 2 },
  { event: 'pipeline/step-10.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 10, 'Scene Video Generation', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const { availableProviders, apiKeys } = await getUserProviders(projectId);
      const styleDNA = project.style_dna as StyleDNA;
      const storyboard = project.storyboard as Storyboard;
      const quality = (project.quality ?? 'fast') as QualitySetting;

      const { data: sceneRecords } = await (await import('@/lib/supabase')).supabaseAdmin
        .from('scenes')
        .select('scene_index, keyframe_url')
        .eq('project_id', projectId)
        .order('scene_index');

      const scenesWithKeyframes = storyboard.scenes.map((s) => {
        const record = sceneRecords?.find((r) => r.scene_index === s.sceneIndex);
        return {
          ...s,
          keyframeUrl: record?.keyframe_url ?? s.keyframeUrl,
        };
      });

      const videoResults = await generateSceneVideos(
        scenesWithKeyframes,
        styleDNA,
        projectId,
        quality,
        availableProviders,
        apiKeys
      );

      const totalCost = videoResults.reduce((sum, r) => sum + r.costUsd, 0);
      return { videoResults, totalCost };
    });

    await step.run('persist', async () => {
      const sceneUpdates = result.videoResults.map((r) => ({
        scene_index: r.sceneIndex,
        video_url: r.videoUrl,
        used_t2v_fallback: r.usedT2vFallback,
        status: 'generating_audio',
      }));

      await upsertScenes(projectId, sceneUpdates);
      await updateProject(projectId, { status: 'step_10', current_step: 10 });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 10, 'Scene Video Generation', 'completed', {
        costUsd: result.totalCost,
      });
    });

    await inngest.send({ name: 'pipeline/step-11.requested', data: { projectId } });

    return result;
  }
);
