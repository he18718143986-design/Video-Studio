import type { Script, StyleDNA, Storyboard, StoryboardScene, Provider } from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import * as openaiAdapter from './adapters/openaiAdapter';
import * as anthropicAdapter from './adapters/anthropicAdapter';
import { calculateCost } from './observability';

export async function generateStoryboard(
  script: Script,
  styleDNA: StyleDNA,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ storyboard: Storyboard; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_7_storyboard', availableProviders);

  const systemPrompt = `You are a master educational video director specializing in 3D animated science explainers.
Your task is to create a detailed storyboard with visual prompts for AI image and video generation.

For each scene, you must:
1. Generate a detailed visualPrompt suitable for AI image generation
2. Specify camera motion for video generation
3. List key visual elements that must appear
4. Verify the visual subject is unambiguous and suitable for generation models

VISUAL STYLE FROM REFERENCE:
Rendering: ${styleDNA.visualPipeline.renderingStyle}
Color Grading: ${styleDNA.visualPipeline.colorGrading}
Lighting: ${styleDNA.visualPipeline.lighting}
Palette: ${styleDNA.visualPipeline.palette.join(', ')}
Composition: ${styleDNA.visualPipeline.compositionRules.join(', ')}
Camera Patterns: ${styleDNA.visualPipeline.cameraMotionPatterns.join(', ')}`;

  const sceneDescriptions = script.scenes.map((s) =>
    `Scene ${s.sceneIndex} [${s.beat}]: "${s.voiceover}" (${s.estimatedDurationSec}s)`
  ).join('\n');

  const prompt = `Create a storyboard for this ${script.scenes.length}-scene educational video.

SCRIPT:
${sceneDescriptions}

For each scene, generate:
1. visualPrompt: detailed AI image generation prompt (include style, lighting, composition details)
2. cameraMotion: specific motion instruction (e.g., "slow push-in from wide to medium")
3. keyElements: array of must-include visual elements
4. Subject isolation check: ensure the main subject is clear and unambiguous

Return ONLY valid JSON (no code fences):
{
  "scenes": [
    {
      "sceneIndex": number,
      "beat": "beat name",
      "voiceover": "voiceover text",
      "visualPrompt": "detailed visual generation prompt",
      "cameraMotion": "camera motion instruction",
      "keyElements": ["element1", "element2"],
      "estimatedDurationSec": number,
      "usedT2vFallback": false,
      "status": "pending"
    }
  ]
}`;

  let text: string;
  let inputTokens = 0;
  let outputTokens = 0;

  switch (provider) {
    case 'google': {
      const result = await geminiAdapter.generateText({ model, systemPrompt, prompt, apiKey: apiKeys?.['google'] });
      text = result.text; inputTokens = result.inputTokens; outputTokens = result.outputTokens;
      break;
    }
    case 'openai': {
      const result = await openaiAdapter.generateText({ model, systemPrompt, prompt, apiKey: apiKeys?.['openai'] });
      text = result.text; inputTokens = result.inputTokens; outputTokens = result.outputTokens;
      break;
    }
    case 'anthropic': {
      const result = await anthropicAdapter.generateText({ model, systemPrompt, prompt, apiKey: apiKeys?.['anthropic'] });
      text = result.text; inputTokens = result.inputTokens; outputTokens = result.outputTokens;
      break;
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const costUsd = calculateCost(model, { inputTokens, outputTokens });

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { scenes: StoryboardScene[] };

    const scenes: StoryboardScene[] = parsed.scenes.map((s, i) => ({
      sceneIndex: s.sceneIndex ?? i,
      beat: s.beat ?? script.scenes[i]?.beat ?? 'explanation',
      voiceover: s.voiceover ?? script.scenes[i]?.voiceover ?? '',
      visualPrompt: s.visualPrompt ?? '',
      cameraMotion: s.cameraMotion ?? 'static wide shot',
      keyElements: s.keyElements ?? [],
      estimatedDurationSec: s.estimatedDurationSec ?? script.scenes[i]?.estimatedDurationSec ?? 8,
      usedT2vFallback: false,
      status: 'pending' as const,
    }));

    return { storyboard: { scenes }, costUsd, model };
  } catch {
    const scenes: StoryboardScene[] = script.scenes.map((s) => ({
      sceneIndex: s.sceneIndex,
      beat: s.beat,
      voiceover: s.voiceover,
      visualPrompt: `${styleDNA.visualPipeline.renderingStyle}, ${styleDNA.visualPipeline.colorGrading}, ${styleDNA.visualPipeline.lighting}, scene depicting: ${s.voiceover}`,
      cameraMotion: styleDNA.visualPipeline.cameraMotionPatterns[0] ?? 'static wide shot',
      keyElements: ['main subject'],
      estimatedDurationSec: s.estimatedDurationSec,
      usedT2vFallback: false,
      status: 'pending' as const,
    }));

    return { storyboard: { scenes }, costUsd, model };
  }
}
