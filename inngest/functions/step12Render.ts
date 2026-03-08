import { inngest } from '../client';
import { emitPipelineEvent } from '@/services/observability';
import { renderFinalVideo } from '@/services/videoRenderer';
import { getProjectData, updateProject } from './helpers';
import type { Storyboard, StoryboardScene } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase';

export const step12Render = inngest.createFunction(
  { id: 'step-12-render', retries: 2 },
  { event: 'pipeline/step-12.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, 12, 'Video Rendering', 'started');
    });

    const result = await step.run('execute', async () => {
      const project = await getProjectData(projectId);
      const storyboard = project.storyboard as Storyboard;

      const { data: sceneRecords } = await supabaseAdmin
        .from('scenes')
        .select('*')
        .eq('project_id', projectId)
        .order('scene_index');

      const scenesWithAssets: StoryboardScene[] = storyboard.scenes.map((s) => {
        const record = sceneRecords?.find((r) => r.scene_index === s.sceneIndex);
        return {
          ...s,
          audioUrl: record?.audio_url ?? s.audioUrl,
          keyframeUrl: record?.keyframe_url ?? s.keyframeUrl,
          videoUrl: record?.video_url ?? s.videoUrl,
          actualAudioDurationSec: record?.actual_audio_duration_sec ?? s.actualAudioDurationSec,
        };
      });

      const finalVideoUrl = await renderFinalVideo(scenesWithAssets, projectId);
      return { finalVideoUrl };
    });

    await step.run('persist', async () => {
      await updateProject(projectId, {
        final_video_url: result.finalVideoUrl,
        status: 'complete',
        current_step: 12,
      });
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, 12, 'Video Rendering', 'completed', {
        costUsd: 0,
      });
    });

    return result;
  }
);
