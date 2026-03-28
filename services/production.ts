import type { StyleDNA, StoryboardScene, Provider } from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import * as openaiAdapter from './adapters/openaiAdapter';
import * as veoAdapter from './adapters/veoAdapter';
import * as klingAdapter from './adapters/klingAdapter';
import * as runwayAdapter from './adapters/runwayAdapter';
import { uploadBuffer } from '@/lib/gcs';
import { PromisePool } from '@/lib/utils';
import { calculateCost } from './observability';

export async function generateReferenceSheet(
  styleDNA: StyleDNA,
  projectId: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ referenceSheetUrl: string; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_8_reference_sheet', availableProviders);

  const prompt = `Create a style reference sheet for a 3D animated science explainer video.
Show in a single image:
- Color palette swatches: ${styleDNA.visualPipeline.palette.join(', ')}
- Lighting mood: ${styleDNA.visualPipeline.lighting}
- Material/texture feel: ${styleDNA.visualPipeline.renderingStyle}
- Representative 3D object rendering style example
- Spatial composition example following: ${styleDNA.visualPipeline.compositionRules.join(', ')}
- Color grading: ${styleDNA.visualPipeline.colorGrading}

Style: clean reference sheet layout, professional quality, grid arrangement.`;

  let imageBuffer: Buffer;

  switch (provider) {
    case 'google': {
      const result = await geminiAdapter.generateImage({
        model,
        prompt,
        apiKey: apiKeys?.['google'],
      });
      imageBuffer = Buffer.from(result.imageBase64, 'base64');
      break;
    }
    case 'openai': {
      const result = await openaiAdapter.generateImage({
        model,
        prompt,
        apiKey: apiKeys?.['openai'],
      });
      const response = await fetch(result.imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      break;
    }
    default:
      throw new Error(`Unsupported provider for reference sheet: ${provider}`);
  }

  const gcsPath = `projects/${projectId}/reference_sheet.png`;
  const referenceSheetUrl = await uploadBuffer(imageBuffer, gcsPath, 'image/png');

  return { referenceSheetUrl, costUsd: calculateCost(model, { imageCount: 1 }), model };
}

export async function generateKeyframes(
  scenes: StoryboardScene[],
  styleDNA: StyleDNA,
  referenceSheetUrl: string | undefined,
  projectId: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<Array<{ sceneIndex: number; keyframeUrl: string; costUsd: number }>> {
  const { provider, model } = selectModel('step_9_keyframes', availableProviders);
  const pool = new PromisePool(3);

  const results: Array<{ sceneIndex: number; keyframeUrl: string; costUsd: number }> = [];

  const tasks = scenes.map((scene) =>
    pool.add(async () => {
      const fullPrompt = `${scene.visualPrompt}
Style: ${styleDNA.visualPipeline.renderingStyle}
Color palette: ${styleDNA.visualPipeline.palette.join(', ')}
Lighting: ${styleDNA.visualPipeline.lighting}
Color grading: ${styleDNA.visualPipeline.colorGrading}
Key elements: ${scene.keyElements.join(', ')}
Composition: ${styleDNA.visualPipeline.compositionRules.join(', ')}`;

      let imageBuffer: Buffer;

      switch (provider) {
        case 'google': {
          const result = await geminiAdapter.generateImage({
            model,
            prompt: fullPrompt,
            apiKey: apiKeys?.['google'],
          });
          imageBuffer = Buffer.from(result.imageBase64, 'base64');
          break;
        }
        case 'openai': {
          const result = await openaiAdapter.generateImage({
            model,
            prompt: fullPrompt,
            apiKey: apiKeys?.['openai'],
          });
          const response = await fetch(result.imageUrl);
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
          break;
        }
        default:
          throw new Error(`Unsupported provider for keyframes: ${provider}`);
      }

      const gcsPath = `projects/${projectId}/keyframes/scene_${scene.sceneIndex}.png`;
      const keyframeUrl = await uploadBuffer(imageBuffer, gcsPath, 'image/png');

      return {
        sceneIndex: scene.sceneIndex,
        keyframeUrl,
        costUsd: calculateCost(model, { imageCount: 1 }),
      };
    })
  );

  const taskResults = await Promise.all(tasks);
  results.push(...taskResults);

  return results;
}

export async function generateSceneVideos(
  scenes: StoryboardScene[],
  styleDNA: StyleDNA,
  projectId: string,
  quality: 'fast' | 'high',
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<Array<{ sceneIndex: number; videoUrl: string; usedT2vFallback: boolean; costUsd: number }>> {
  const { provider, model } = selectModel('step_10_video_gen', availableProviders, quality);
  const pool = new PromisePool(3);

  const results: Array<{ sceneIndex: number; videoUrl: string; usedT2vFallback: boolean; costUsd: number }> = [];

  const tasks = scenes.map((scene) =>
    pool.add(async () => {
      let videoBuffer: Buffer | undefined;
      let usedT2vFallback = false;

      const styleNote = styleDNA.visualPipeline.renderingStyle;
      const toneNote = styleDNA.audioPipeline.musicMood;
      const palette = styleDNA.visualPipeline.palette;

      if (scene.keyframeUrl) {
        try {
          let keyframeBase64: string;
          if (scene.keyframeUrl.startsWith('gs://')) {
            const { downloadFile } = await import('@/lib/gcs');
            const tmpPath = `/tmp/keyframe_${scene.sceneIndex}.png`;
            await downloadFile(scene.keyframeUrl, tmpPath);
            const { readFileSync } = await import('fs');
            keyframeBase64 = readFileSync(tmpPath).toString('base64');
          } else {
            const response = await fetch(scene.keyframeUrl);
            const buffer = await response.arrayBuffer();
            keyframeBase64 = Buffer.from(buffer).toString('base64');
          }

          switch (provider) {
            case 'google': {
              const result = await veoAdapter.generateVideoFromImage({
                model,
                prompt: `${scene.visualPrompt}\n${scene.cameraMotion}`,
                imageBase64: keyframeBase64,
                apiKey: apiKeys?.['google'],
              });
              videoBuffer = Buffer.from(result.videoBase64, 'base64');
              break;
            }
            case 'kling': {
              const result = await klingAdapter.generateVideo({
                model,
                prompt: `${scene.visualPrompt}\n${scene.cameraMotion}`,
                imageBase64: keyframeBase64,
                apiKey: apiKeys?.['kling'],
              });
              const response = await fetch(result.videoUrl);
              const arrayBuffer = await response.arrayBuffer();
              videoBuffer = Buffer.from(arrayBuffer);
              break;
            }
            case 'runway': {
              const result = await runwayAdapter.generateVideo({
                model,
                prompt: `${scene.visualPrompt}\n${scene.cameraMotion}`,
                imageUrl: scene.keyframeUrl,
                apiKey: apiKeys?.['runway'],
              });
              const response = await fetch(result.videoUrl);
              const arrayBuffer = await response.arrayBuffer();
              videoBuffer = Buffer.from(arrayBuffer);
              break;
            }
            default:
              throw new Error(`Unsupported provider for video generation: ${provider}`);
          }
        } catch {
          usedT2vFallback = true;
        }
      } else {
        usedT2vFallback = true;
      }

      if (usedT2vFallback || !videoBuffer) {
        usedT2vFallback = true;
        const t2vPrompt = `${scene.visualPrompt}\n${scene.cameraMotion}\nStyle: ${styleNote}\nTone: ${toneNote}\nKey elements: ${scene.keyElements.join(', ')}\nColor palette: ${palette.join(', ')}\nKeep motion natural and consistent with the reference style.`;

        switch (provider) {
          case 'google': {
            const result = await veoAdapter.generateVideoFromText({
              model,
              prompt: t2vPrompt,
              apiKey: apiKeys?.['google'],
            });
            videoBuffer = Buffer.from(result.videoBase64, 'base64');
            break;
          }
          case 'kling': {
            const result = await klingAdapter.generateVideo({
              model,
              prompt: t2vPrompt,
              apiKey: apiKeys?.['kling'],
            });
            const response = await fetch(result.videoUrl);
            const arrayBuffer = await response.arrayBuffer();
            videoBuffer = Buffer.from(arrayBuffer);
            break;
          }
          case 'runway': {
            const result = await runwayAdapter.generateVideo({
              model,
              prompt: t2vPrompt,
              apiKey: apiKeys?.['runway'],
            });
            const response = await fetch(result.videoUrl);
            const arrayBuffer = await response.arrayBuffer();
            videoBuffer = Buffer.from(arrayBuffer);
            break;
          }
          default:
            throw new Error(`Unsupported provider for T2V fallback: ${provider}`);
        }
      }

      const gcsPath = `projects/${projectId}/videos/scene_${scene.sceneIndex}.mp4`;
      const videoUrl = await uploadBuffer(videoBuffer!, gcsPath, 'video/mp4');

      const costPerCall = quality === 'high' ? 0.35 : 0.10;
      return { sceneIndex: scene.sceneIndex, videoUrl, usedT2vFallback, costUsd: costPerCall };
    })
  );

  const taskResults = await Promise.all(tasks);
  results.push(...taskResults);

  return results;
}
