import type { Script, Storyboard, StyleDNA, RefinementMode, Provider } from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import * as openaiAdapter from './adapters/openaiAdapter';
import * as anthropicAdapter from './adapters/anthropicAdapter';
import { calculateCost } from './observability';

interface RefinementInput {
  mode: RefinementMode;
  script?: Script;
  storyboard?: Storyboard;
  styleDNA: StyleDNA;
  feedback: string;
  sceneIndex?: number;
}

interface RefinementOutput {
  updatedScript?: Script;
  updatedStoryboard?: Storyboard;
  affectedSceneIndices: number[];
  costUsd: number;
  model: string;
}

async function callTextModel(
  systemPrompt: string,
  prompt: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ text: string; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_13_refinement', availableProviders);

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
  return { text, costUsd, model };
}

export async function refine(
  input: RefinementInput,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<RefinementOutput> {
  switch (input.mode) {
    case 'full_script':
      return refineFullScript(input, availableProviders, apiKeys);
    case 'single_scene':
      return refineSingleScene(input, availableProviders, apiKeys);
    case 'visual_prompts':
      return refineVisualPrompts(input, availableProviders, apiKeys);
    default:
      throw new Error(`Unknown refinement mode: ${input.mode}`);
  }
}

async function refineFullScript(
  input: RefinementInput,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<RefinementOutput> {
  if (!input.script) throw new Error('Script required for full_script refinement');

  const systemPrompt = `You are refining the voiceover script for a science explainer video.
Preserve the StyleDNA constraints while incorporating user feedback.

Style constraints:
- Tone: ${input.styleDNA.scriptPipeline?.tone ?? 'educational'}
- Vocabulary: ${input.styleDNA.scriptPipeline?.vocabularyLevel ?? 'intermediate'}
- Metaphor Density: ${input.styleDNA.scriptPipeline?.metaphorDensity ?? 'medium'}
- Language: ${input.script.language}`;

  const fullScript = input.script.scenes.map((s) =>
    `Scene ${s.sceneIndex} [${s.beat}]: ${s.voiceover}`
  ).join('\n\n');

  const prompt = `CURRENT SCRIPT:
${fullScript}

USER FEEDBACK:
${input.feedback}

Rewrite the full script incorporating the feedback while preserving style constraints.
Return ONLY valid JSON (no code fences):
{
  "scenes": [
    {
      "sceneIndex": number,
      "beat": "beat name",
      "voiceover": "revised voiceover text",
      "wordCount": number,
      "estimatedDurationSec": number
    }
  ],
  "totalWordCount": number,
  "totalEstimatedDurationSec": number,
  "language": "${input.script.language}"
}`;

  const { text, costUsd, model } = await callTextModel(systemPrompt, prompt, availableProviders, apiKeys);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as Script;

    const updatedScript: Script = {
      ...parsed,
      scenes: parsed.scenes.map((s, i) => ({
        ...s,
        contractRef: input.script!.scenes[i]?.contractRef ?? input.script!.scenes[0]!.contractRef,
      })),
    };

    return {
      updatedScript,
      affectedSceneIndices: updatedScript.scenes.map((s) => s.sceneIndex),
      costUsd,
      model,
    };
  } catch {
    return {
      updatedScript: input.script,
      affectedSceneIndices: [],
      costUsd,
      model,
    };
  }
}

async function refineSingleScene(
  input: RefinementInput,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<RefinementOutput> {
  if (!input.script || input.sceneIndex === undefined) {
    throw new Error('Script and sceneIndex required for single_scene refinement');
  }

  const scene = input.script.scenes.find((s) => s.sceneIndex === input.sceneIndex);
  if (!scene) throw new Error(`Scene ${input.sceneIndex} not found`);

  const systemPrompt = `You are refining a single scene's voiceover in a science explainer video.
Preserve StyleDNA constraints and keep consistency with surrounding scenes.

Style: ${input.styleDNA.scriptPipeline?.tone ?? 'educational'}
Vocabulary: ${input.styleDNA.scriptPipeline?.vocabularyLevel ?? 'intermediate'}`;

  const prompt = `CURRENT SCENE ${input.sceneIndex} [${scene.beat}]:
"${scene.voiceover}"

USER FEEDBACK:
${input.feedback}

Rewrite ONLY this scene's voiceover. Return ONLY valid JSON (no code fences):
{
  "sceneIndex": ${input.sceneIndex},
  "beat": "${scene.beat}",
  "voiceover": "revised voiceover",
  "wordCount": number,
  "estimatedDurationSec": number
}`;

  const { text, costUsd, model } = await callTextModel(systemPrompt, prompt, availableProviders, apiKeys);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { sceneIndex: number; beat: string; voiceover: string; wordCount: number; estimatedDurationSec: number };

    const updatedScript: Script = {
      ...input.script,
      scenes: input.script.scenes.map((s) =>
        s.sceneIndex === input.sceneIndex
          ? { ...s, voiceover: parsed.voiceover, wordCount: parsed.wordCount, estimatedDurationSec: parsed.estimatedDurationSec }
          : s
      ),
    };

    return {
      updatedScript,
      affectedSceneIndices: [input.sceneIndex],
      costUsd,
      model,
    };
  } catch {
    return {
      updatedScript: input.script,
      affectedSceneIndices: [],
      costUsd,
      model,
    };
  }
}

async function refineVisualPrompts(
  input: RefinementInput,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<RefinementOutput> {
  if (!input.storyboard) throw new Error('Storyboard required for visual_prompts refinement');

  const systemPrompt = `You are updating visual prompts for a science explainer video storyboard.
Preserve the visual style from StyleDNA while incorporating user feedback.

Visual Style:
- Rendering: ${input.styleDNA.visualPipeline.renderingStyle}
- Palette: ${input.styleDNA.visualPipeline.palette.join(', ')}
- Lighting: ${input.styleDNA.visualPipeline.lighting}`;

  const storyboardDesc = input.storyboard.scenes.map((s) =>
    `Scene ${s.sceneIndex}: Visual="${s.visualPrompt}" Camera="${s.cameraMotion}"`
  ).join('\n');

  const prompt = `CURRENT STORYBOARD:
${storyboardDesc}

USER FEEDBACK:
${input.feedback}

Update ONLY the affected scenes' visual prompts. Return ONLY valid JSON (no code fences):
{
  "updatedScenes": [
    {
      "sceneIndex": number,
      "visualPrompt": "updated visual prompt",
      "cameraMotion": "updated camera motion",
      "keyElements": ["updated elements"]
    }
  ]
}`;

  const { text, costUsd, model } = await callTextModel(systemPrompt, prompt, availableProviders, apiKeys);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      updatedScenes: Array<{ sceneIndex: number; visualPrompt: string; cameraMotion: string; keyElements: string[] }>;
    };

    const affectedIndices = parsed.updatedScenes.map((s) => s.sceneIndex);
    const updatedStoryboard: Storyboard = {
      ...input.storyboard,
      scenes: input.storyboard.scenes.map((s) => {
        const update = parsed.updatedScenes.find((u) => u.sceneIndex === s.sceneIndex);
        if (update) {
          return {
            ...s,
            visualPrompt: update.visualPrompt,
            cameraMotion: update.cameraMotion,
            keyElements: update.keyElements,
          };
        }
        return s;
      }),
    };

    return {
      updatedStoryboard,
      affectedSceneIndices: affectedIndices,
      costUsd,
      model,
    };
  } catch {
    return {
      updatedStoryboard: input.storyboard,
      affectedSceneIndices: [],
      costUsd,
      model,
    };
  }
}
