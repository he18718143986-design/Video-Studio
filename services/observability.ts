import type { CostEntry, Provider, PipelineEvent } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase';

export const COST_TABLE: Record<string, CostEntry> = {
  'gemini-3-pro': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
  'gemini-3-pro-preview': { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
  'gemini-3-flash': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
  'gemini-3-flash-preview': { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
  'gemini-3-pro-image': { perImage: 0.04 },
  'gemini-3-pro-image-preview': { perImage: 0.04 },
  'veo-3-fast': { perCall: 0.10 },
  'veo-3-fast-generate-preview': { perCall: 0.10 },
  'veo-3': { perCall: 0.35 },
  'veo-3-generate-preview': { perCall: 0.35 },
  'gemini-tts': { perCharacter: 0.000004 },
  'gemini-3-tts-preview': { perCharacter: 0.000004 },
  'elevenlabs': { perCharacter: 0.00003 },
  'eleven_multilingual_v2': { perCharacter: 0.00003 },
  'openai-gpt4o': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
  'gpt-4o': { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
  'openai-gpt4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  'gpt-4o-mini': { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  'claude-opus-4-5': { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
  'claude-haiku': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
  'claude-haiku-4-5-20251001': { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
  'dall-e-3': { perImage: 0.04 },
  'stable-diffusion-3': { perImage: 0.035 },
  'kling-v1-5': { perCall: 0.14 },
  'runway-gen3': { perCall: 0.20 },
  'gen3a_turbo': { perCall: 0.20 },
  'tts-1-hd': { perCharacter: 0.00003 },
};

export function calculateCost(
  model: string,
  params: { inputTokens?: number; outputTokens?: number; imageCount?: number; characterCount?: number; callCount?: number }
): number {
  const entry = COST_TABLE[model];
  if (!entry) return 0;

  let cost = 0;

  if (entry.inputPer1kTokens && params.inputTokens) {
    cost += (params.inputTokens / 1000) * entry.inputPer1kTokens;
  }
  if (entry.outputPer1kTokens && params.outputTokens) {
    cost += (params.outputTokens / 1000) * entry.outputPer1kTokens;
  }
  if (entry.perImage && params.imageCount) {
    cost += params.imageCount * entry.perImage;
  }
  if (entry.perCharacter && params.characterCount) {
    cost += params.characterCount * entry.perCharacter;
  }
  if (entry.perCall && params.callCount) {
    cost += params.callCount * entry.perCall;
  }

  return cost;
}

export async function emitPipelineEvent(
  projectId: string,
  stepNumber: number,
  stepName: string,
  status: PipelineEvent['status'],
  extras?: { costUsd?: number; modelUsed?: string; durationMs?: number; message?: string }
): Promise<void> {
  try {
    await supabaseAdmin.from('pipeline_events').insert({
      project_id: projectId,
      step_number: stepNumber,
      step_name: stepName,
      status,
      message: extras?.message ?? null,
      cost_usd: extras?.costUsd ?? null,
      model_used: extras?.modelUsed ?? null,
      duration_ms: extras?.durationMs ?? null,
    });

    if (status === 'completed' || status === 'failed') {
      const updateData: Record<string, unknown> = {
        current_step: stepNumber,
        updated_at: new Date().toISOString(),
      };

      if (status === 'failed') {
        updateData['status'] = 'failed';
        updateData['error_message'] = extras?.message ?? `Step ${stepNumber} failed`;
      } else if (stepNumber === 12) {
        updateData['status'] = 'complete';
      } else {
        updateData['status'] = `step_${stepNumber}`;
      }

      if (extras?.costUsd) {
        const { data: project } = await supabaseAdmin
          .from('projects')
          .select('total_cost_usd')
          .eq('id', projectId)
          .single();

        if (project) {
          updateData['total_cost_usd'] = (Number(project.total_cost_usd) || 0) + extras.costUsd;
        }
      }

      await supabaseAdmin.from('projects').update(updateData).eq('id', projectId);
    }
  } catch (error) {
    console.error('Failed to emit pipeline event:', error);
  }
}

export function trackModelCall(
  provider: Provider,
  model: string,
  stepName: string,
  startTime: number
): {
  end: (params: { inputTokens?: number; outputTokens?: number; imageCount?: number; characterCount?: number; callCount?: number }) => { costUsd: number; durationMs: number };
} {
  return {
    end: (params) => {
      const durationMs = Date.now() - startTime;
      const costUsd = calculateCost(model, params);

      try {
        if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
          logToLangfuse({
            provider,
            model,
            stepName,
            durationMs,
            costUsd,
            ...params,
          });
        }
      } catch {
        // Langfuse logging is best-effort
      }

      return { costUsd, durationMs };
    },
  };
}

function logToLangfuse(data: {
  provider: Provider;
  model: string;
  stepName: string;
  durationMs: number;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  characterCount?: number;
  callCount?: number;
}): void {
  const host = process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com';
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) return;

  fetch(`${host}/api/public/ingestion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
    },
    body: JSON.stringify({
      batch: [
        {
          id: crypto.randomUUID(),
          type: 'generation-create',
          timestamp: new Date().toISOString(),
          body: {
            name: data.stepName,
            model: data.model,
            modelParameters: { provider: data.provider },
            usage: {
              input: data.inputTokens ?? 0,
              output: data.outputTokens ?? 0,
              total: (data.inputTokens ?? 0) + (data.outputTokens ?? 0),
            },
            metadata: {
              durationMs: data.durationMs,
              costUsd: data.costUsd,
              imageCount: data.imageCount,
              characterCount: data.characterCount,
            },
          },
        },
      ],
    }),
  }).catch(() => {
    // Best-effort
  });
}
