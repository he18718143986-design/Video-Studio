import type {
  Provider,
  Capability,
  PipelineStep,
  StepRequirement,
  ModelPlan,
  ModelPlanStep,
  MissingCapability,
  ModelUnavailableError as ModelUnavailableErrorType,
} from '@/lib/types';
import { ModelUnavailableError } from '@/lib/types';

export const CAPABILITY_MATRIX: Record<Provider, Capability[]> = {
  google: ['video_understanding', 'image_understanding', 'text_reasoning', 'fast_reasoning', 'image_generation', 'video_generation', 'tts'],
  openai: ['image_understanding', 'text_reasoning', 'fast_reasoning', 'image_generation', 'tts'],
  anthropic: ['image_understanding', 'text_reasoning', 'fast_reasoning'],
  elevenlabs: ['tts'],
  stability: ['image_generation'],
  kling: ['video_generation'],
  runway: ['video_generation'],
};

export const STEP_REQUIREMENTS: Record<PipelineStep, StepRequirement> = {
  step_1_safety: { capability: 'fast_reasoning' },
  step_2a_capability_assessment: { capability: 'video_understanding', preferred: 'google' },
  step_2b_style_dna: { capability: 'video_understanding', preferred: 'google' },
  step_3_research: { capability: 'fast_reasoning', preferred: 'google' },
  step_4_narrative_map: { capability: 'text_reasoning', preferred: 'anthropic' },
  step_5_script: { capability: 'text_reasoning', preferred: 'anthropic' },
  step_6_qa_audit: { capability: 'fast_reasoning' },
  step_7_storyboard: { capability: 'text_reasoning' },
  step_8_reference_sheet: { capability: 'image_generation', preferred: 'google' },
  step_9_keyframes: { capability: 'image_generation', preferred: 'google' },
  step_10_video_gen: { capability: 'video_generation', preferred: 'google' },
  step_11_tts: { capability: 'tts', preferred: 'elevenlabs' },
  step_12_render: { capability: 'fast_reasoning' },
  step_13_refinement: { capability: 'text_reasoning' },
};

export const MODEL_MAP: Record<Provider, Partial<Record<Capability, string>>> = {
  google: {
    video_understanding: 'gemini-3-pro-preview',
    image_understanding: 'gemini-3-pro-preview',
    text_reasoning: 'gemini-3-pro-preview',
    fast_reasoning: 'gemini-3-flash-preview',
    image_generation: 'gemini-3-pro-image-preview',
    video_generation: 'veo-3-fast-generate-preview',
    tts: 'gemini-3-tts-preview',
  },
  openai: {
    image_understanding: 'gpt-4o',
    text_reasoning: 'gpt-4o',
    fast_reasoning: 'gpt-4o-mini',
    image_generation: 'dall-e-3',
    tts: 'tts-1-hd',
  },
  anthropic: {
    image_understanding: 'claude-opus-4-5',
    text_reasoning: 'claude-opus-4-5',
    fast_reasoning: 'claude-haiku-4-5-20251001',
  },
  elevenlabs: { tts: 'eleven_multilingual_v2' },
  stability: { image_generation: 'stable-diffusion-3' },
  kling: { video_generation: 'kling-v1-5' },
  runway: { video_generation: 'gen3a_turbo' },
};

export function selectModel(
  step: PipelineStep,
  availableProviders: Record<Provider, boolean>,
  qualityOverride?: 'fast' | 'high'
): { provider: Provider; model: string } {
  const requirement = STEP_REQUIREMENTS[step];
  if (!requirement) {
    throw new ModelUnavailableError(step, 'text_reasoning');
  }
  const { capability, preferred } = requirement;

  if (preferred && availableProviders[preferred]) {
    const modelName = MODEL_MAP[preferred]?.[capability];
    if (modelName) {
      let model = modelName;
      if (capability === 'video_generation' && qualityOverride === 'high' && preferred === 'google') {
        model = 'veo-3-generate-preview';
      }
      return { provider: preferred, model };
    }
  }

  const providers = Object.entries(CAPABILITY_MATRIX) as Array<[Provider, Capability[]]>;
  for (const [provider, caps] of providers) {
    if (availableProviders[provider] && caps.includes(capability)) {
      const modelName = MODEL_MAP[provider]?.[capability];
      if (modelName) {
        let model = modelName;
        if (capability === 'video_generation' && qualityOverride === 'high' && provider === 'google') {
          model = 'veo-3-generate-preview';
        }
        return { provider, model };
      }
    }
  }

  throw new ModelUnavailableError(step, capability);
}

export function preflightCheck(
  availableProviders: Record<Provider, boolean>
): ModelPlan {
  const steps: ModelPlanStep[] = [];
  const missingCapabilities: MissingCapability[] = [];

  const allSteps: PipelineStep[] = [
    'step_1_safety', 'step_2a_capability_assessment', 'step_2b_style_dna',
    'step_3_research', 'step_4_narrative_map', 'step_5_script',
    'step_6_qa_audit', 'step_7_storyboard', 'step_8_reference_sheet',
    'step_9_keyframes', 'step_10_video_gen', 'step_11_tts', 'step_12_render',
  ];

  for (const step of allSteps) {
    try {
      const { provider, model } = selectModel(step, availableProviders);
      steps.push({
        step,
        provider,
        model,
        estimatedCostUsd: estimateStepCost(step, model),
      });
    } catch (err) {
      if (err instanceof ModelUnavailableError) {
        const requirement = STEP_REQUIREMENTS[step];
        const suggestedProvider = requirement?.preferred ?? 'google';
        missingCapabilities.push({
          step,
          capability: requirement?.capability ?? 'text_reasoning',
          suggestedProvider,
        });
      }
    }
  }

  const totalEstimatedCostUsd = steps.reduce((sum, s) => sum + s.estimatedCostUsd, 0);

  return { steps, totalEstimatedCostUsd, missingCapabilities };
}

function estimateStepCost(step: PipelineStep, model: string): number {
  const estimates: Record<string, number> = {
    step_1_safety: 0.001,
    step_2a_capability_assessment: 0.01,
    step_2b_style_dna: 0.05,
    step_3_research: 0.005,
    step_4_narrative_map: 0.02,
    step_5_script: 0.02,
    step_6_qa_audit: 0.005,
    step_7_storyboard: 0.02,
    step_8_reference_sheet: 0.04,
    step_9_keyframes: 0.40,
    step_10_video_gen: 1.50,
    step_11_tts: 0.01,
    step_12_render: 0.0,
    step_13_refinement: 0.02,
  };
  return estimates[step] ?? 0.01;
}

export function getAvailableProvidersFromKeys(
  apiKeys: Array<{ provider: Provider }>
): Record<Provider, boolean> {
  const result: Record<Provider, boolean> = {
    google: false,
    openai: false,
    anthropic: false,
    elevenlabs: false,
    stability: false,
    kling: false,
    runway: false,
  };

  for (const key of apiKeys) {
    result[key.provider] = true;
  }

  if (process.env.GOOGLE_AI_API_KEY) result.google = true;
  if (process.env.OPENAI_API_KEY) result.openai = true;
  if (process.env.ANTHROPIC_API_KEY) result.anthropic = true;
  if (process.env.ELEVENLABS_API_KEY) result.elevenlabs = true;
  if (process.env.STABILITY_API_KEY) result.stability = true;
  if (process.env.KLING_API_KEY) result.kling = true;
  if (process.env.RUNWAY_API_KEY) result.runway = true;

  return result;
}
