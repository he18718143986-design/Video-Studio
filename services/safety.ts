import type { SafetyResult, Provider } from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import * as openaiAdapter from './adapters/openaiAdapter';
import * as anthropicAdapter from './adapters/anthropicAdapter';
import { calculateCost } from './observability';

export async function runSafetyCheck(
  topic: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ result: SafetyResult; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_1_safety', availableProviders);

  const prompt = `You are a content safety classifier for an educational science video generation platform.

Evaluate the following topic and determine if it poses safety risks.

Is the topic "${topic}" related to any of the following?
- Medical advice or self-diagnosis guidance
- Self-harm, suicide, or dangerous behaviors
- Dangerous chemical/biological procedures
- High-risk personal health guidance
- Weapons manufacturing or illegal activities
- Content that could harm minors

Return EXACT JSON (no markdown, no code fences):
{
  "isFlagged": boolean,
  "reason": "explanation of why flagged or why safe",
  "safeAlternative": "suggested safe alternative topic if flagged, null if safe"
}

Topic to evaluate: "${topic}"`;

  let text: string;
  let inputTokens = 0;
  let outputTokens = 0;

  switch (provider) {
    case 'google': {
      const result = await geminiAdapter.generateText({
        model,
        prompt,
        apiKey: apiKeys?.['google'],
      });
      text = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      break;
    }
    case 'openai': {
      const result = await openaiAdapter.generateText({
        model,
        prompt,
        apiKey: apiKeys?.['openai'],
      });
      text = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      break;
    }
    case 'anthropic': {
      const result = await anthropicAdapter.generateText({
        model,
        prompt,
        apiKey: apiKeys?.['anthropic'],
      });
      text = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      break;
    }
    default:
      throw new Error(`Unsupported provider for safety check: ${provider}`);
  }

  const costUsd = calculateCost(model, { inputTokens, outputTokens });

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as SafetyResult;
    return {
      result: {
        isFlagged: parsed.isFlagged ?? false,
        reason: parsed.reason ?? '',
        safeAlternative: parsed.safeAlternative ?? null,
      },
      costUsd,
      model,
    };
  } catch {
    return {
      result: { isFlagged: false, reason: 'Safety check parse fallback — allowing topic', safeAlternative: null },
      costUsd,
      model,
    };
  }
}
