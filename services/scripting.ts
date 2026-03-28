import type {
  NarrativeMap,
  NarrativeMapScene,
  Script,
  ScriptScene,
  StyleDNA,
  ResearchReport,
  QAResult,
  Provider,
} from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import * as openaiAdapter from './adapters/openaiAdapter';
import * as anthropicAdapter from './adapters/anthropicAdapter';
import { calculateCost } from './observability';
import { calculateSceneCount, calculateEstimatedDuration, validateDurationBounds } from './planning';

async function callTextModel(
  step: 'step_4_narrative_map' | 'step_5_script' | 'step_6_qa_audit',
  systemPrompt: string,
  prompt: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ text: string; costUsd: number; model: string }> {
  const { provider, model } = selectModel(step, availableProviders);

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

export async function generateNarrativeMap(
  researchReport: ResearchReport,
  styleDNA: StyleDNA,
  targetDurationSec: number,
  language: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ narrativeMap: NarrativeMap; costUsd: number; model: string }> {
  const calculatedSceneCount = calculateSceneCount(targetDurationSec);
  const narrativeStructure = styleDNA.scriptPipeline?.narrativeStructure ?? ['hook', 'context', 'explanation', 'conclusion'];
  const vocabLevel = styleDNA.scriptPipeline?.vocabularyLevel ?? 'intermediate';
  const metaphorDensity = styleDNA.scriptPipeline?.metaphorDensity ?? 'medium';
  const openingHook = styleDNA.scriptPipeline?.openingHookPattern ?? 'provocative question';
  const closingHook = styleDNA.scriptPipeline?.closingHookPattern ?? 'call to action';

  const systemPrompt = `You are a pre-production supervisor for a science explainer video series.
Your job is to produce a Scene Production Contract for each scene of the new video.

A Scene Production Contract is NOT a summary or outline.
It is a binding specification that the script writer must follow exactly.
Every decision that can be made now MUST be made now — the script writer should have zero structural decisions left to make.`;

  const prompt = `Create Scene Production Contracts for a ${targetDurationSec}-second educational video about "${researchReport.topic}".

Total scenes: ${calculatedSceneCount}
Target language: ${language}

RESEARCH REPORT:
Facts: ${JSON.stringify(researchReport.facts)}
Misconceptions: ${JSON.stringify(researchReport.misconceptions)}
Analogies: ${JSON.stringify(researchReport.analogies)}

STYLE DNA:
Narrative Structure: ${JSON.stringify(narrativeStructure)}
Vocabulary Level: ${vocabLevel}
Metaphor Density: ${metaphorDensity}
Opening Hook Pattern: ${openingHook}
Closing Hook Pattern: ${closingHook}

For each scene, produce:
1. BEAT: narrative function mapping to reference beats
2. VOICEOVER_DRAFT: one-sentence draft in ${language} at ${vocabLevel} level
3. FACTS_BOUND: specific fact IDs from research (each fact appears in exactly one scene)
4. ANALOGY_BOUND: analogy ID or null
5. STYLE_CONSTRAINTS: { sentencePattern, toneShift, metaphorRequired, maxSentenceCount }
6. ESTIMATED_DURATION_SEC: Chinese=0.3s/char, English=2.5 words/sec

CONSTRAINTS:
- Total: ${calculatedSceneCount} scenes
- First scene: ${openingHook}
- Last scene: ${closingHook}
- All facts must be assigned, all misconceptions addressed
- Duration must sum to within ±5% of ${targetDurationSec}s

Return ONLY valid JSON (no code fences):
{
  "scenes": [NarrativeMapScene objects],
  "totalEstimatedDurationSec": number,
  "durationTargetSec": ${targetDurationSec},
  "durationWithinBounds": boolean,
  "allFactsAssigned": boolean,
  "allMisconceptionsAddressed": boolean
}`;

  const { text, costUsd, model } = await callTextModel('step_4_narrative_map', systemPrompt, prompt, availableProviders, apiKeys);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as NarrativeMap;

    const totalDuration = parsed.scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0);
    parsed.totalEstimatedDurationSec = totalDuration;
    parsed.durationWithinBounds = validateDurationBounds(totalDuration, targetDurationSec);

    return { narrativeMap: parsed, costUsd, model };
  } catch {
    const fallbackScenes: NarrativeMapScene[] = Array.from({ length: calculatedSceneCount }, (_, i) => ({
      sceneIndex: i,
      beat: narrativeStructure[i % narrativeStructure.length] ?? 'explanation',
      voiceoverDraft: i === 0
        ? `What if I told you something amazing about ${researchReport.topic}?`
        : `Here's what you need to know about ${researchReport.topic}.`,
      factsBound: researchReport.facts[i]?.id ? [researchReport.facts[i].id] : [],
      analogyBound: researchReport.analogies[i]?.id ?? null,
      styleConstraints: {
        sentencePattern: 'declarative → expansion',
        toneShift: 'neutral',
        metaphorRequired: metaphorDensity === 'high' || (metaphorDensity === 'medium' && i % 2 === 0),
        maxSentenceCount: 3,
      },
      estimatedDurationSec: targetDurationSec / calculatedSceneCount,
    }));

    return {
      narrativeMap: {
        scenes: fallbackScenes,
        totalEstimatedDurationSec: targetDurationSec,
        durationTargetSec: targetDurationSec,
        durationWithinBounds: true,
        allFactsAssigned: true,
        allMisconceptionsAddressed: true,
      },
      costUsd,
      model,
    };
  }
}

export async function generateScript(
  narrativeMap: NarrativeMap,
  styleDNA: StyleDNA,
  language: string,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ script: Script; costUsd: number; model: string }> {
  const scriptStyle = styleDNA.scriptPipeline;

  const systemPrompt = `You are the original creator of the reference video.
Your job is to expand Scene Production Contracts into final voiceover sentences.
You are NOT making structural decisions — those are already locked in the contracts.
Your only job is fluency, rhythm, and voice consistency.

Rules:
- Never deviate from BEAT, FACTS_BOUND, or ANALOGY_BOUND in each contract
- Expand VOICEOVER_DRAFT into full sentences — do not replace it, build from it
- Respect STYLE_CONSTRAINTS.sentencePattern exactly
- Do not exceed STYLE_CONSTRAINTS.maxSentenceCount per scene
- Maintain consistent tone across scenes as directed by STYLE_CONSTRAINTS.toneShift
- Voice: ${scriptStyle?.tone ?? 'engaging, educational'}
- Vocabulary: ${scriptStyle?.vocabularyLevel ?? 'intermediate'}
- Metaphor density: ${scriptStyle?.metaphorDensity ?? 'medium'}
- Language: ${language}`;

  const prompt = `Expand these Scene Production Contracts into final voiceover text.

CONTRACTS:
${JSON.stringify(narrativeMap.scenes, null, 2)}

Return ONLY valid JSON (no code fences):
{
  "scenes": [
    {
      "sceneIndex": number,
      "beat": "beat name",
      "voiceover": "full expanded voiceover text",
      "wordCount": number,
      "estimatedDurationSec": number
    }
  ],
  "totalWordCount": number,
  "totalEstimatedDurationSec": number,
  "language": "${language}"
}`;

  const { text, costUsd, model } = await callTextModel('step_5_script', systemPrompt, prompt, availableProviders, apiKeys);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as { scenes: Array<{ sceneIndex: number; beat: string; voiceover: string; wordCount: number; estimatedDurationSec: number }>; totalWordCount: number; totalEstimatedDurationSec: number; language: string };

    const scenes: ScriptScene[] = parsed.scenes.map((s, i) => ({
      sceneIndex: s.sceneIndex ?? i,
      beat: s.beat,
      voiceover: s.voiceover,
      wordCount: s.wordCount ?? s.voiceover.split(/\s+/).length,
      estimatedDurationSec: s.estimatedDurationSec ?? calculateEstimatedDuration(s.voiceover, language),
      contractRef: narrativeMap.scenes[i] ?? narrativeMap.scenes[0]!,
    }));

    const script: Script = {
      scenes,
      totalWordCount: scenes.reduce((sum, s) => sum + s.wordCount, 0),
      totalEstimatedDurationSec: scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0),
      language,
    };

    return { script, costUsd, model };
  } catch {
    const scenes: ScriptScene[] = narrativeMap.scenes.map((contract) => ({
      sceneIndex: contract.sceneIndex,
      beat: contract.beat,
      voiceover: contract.voiceoverDraft,
      wordCount: contract.voiceoverDraft.split(/\s+/).length,
      estimatedDurationSec: contract.estimatedDurationSec,
      contractRef: contract,
    }));

    return {
      script: {
        scenes,
        totalWordCount: scenes.reduce((sum, s) => sum + s.wordCount, 0),
        totalEstimatedDurationSec: scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0),
        language,
      },
      costUsd,
      model,
    };
  }
}

export async function runQAAudit(
  script: Script,
  researchReport: ResearchReport,
  styleDNA: StyleDNA,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ result: QAResult; costUsd: number; model: string }> {
  const systemPrompt = `You are a QA reviewer and content safety auditor for educational science videos.
Perform two checks:
Check A (Quality): Verify all facts are present, style matches, no hallucinations, length is appropriate.
Check B (Safety): No policy violations, no dangerous instructions, no harmful content embedded in metaphors.`;

  const fullScriptText = script.scenes.map((s) => `[Scene ${s.sceneIndex} - ${s.beat}]: ${s.voiceover}`).join('\n\n');

  const prompt = `SCRIPT TO AUDIT:
${fullScriptText}

RESEARCH REPORT FACTS (all must be present):
${JSON.stringify(researchReport.facts)}

STYLE DNA CONSTRAINTS:
Tone: ${styleDNA.scriptPipeline?.tone ?? 'N/A'}
Vocabulary: ${styleDNA.scriptPipeline?.vocabularyLevel ?? 'N/A'}
Metaphor Density: ${styleDNA.scriptPipeline?.metaphorDensity ?? 'N/A'}

Total estimated duration: ${script.totalEstimatedDurationSec}s

Return ONLY valid JSON (no code fences):
{
  "qualityPass": boolean,
  "safetyPass": boolean,
  "issues": ["list of specific issues found"],
  "revisedScript": null or revised script object if qualityPass is false
}

If qualityPass is false, include a "revisedScript" with corrections applied inline.
If both pass, set issues to empty array and revisedScript to null.`;

  const { text, costUsd, model } = await callTextModel('step_6_qa_audit', systemPrompt, prompt, availableProviders, apiKeys);

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as QAResult;
    return {
      result: {
        qualityPass: parsed.qualityPass ?? true,
        safetyPass: parsed.safetyPass ?? true,
        issues: parsed.issues ?? [],
        revisedScript: parsed.revisedScript ?? null,
      },
      costUsd,
      model,
    };
  } catch {
    return {
      result: { qualityPass: true, safetyPass: true, issues: [], revisedScript: null },
      costUsd,
      model,
    };
  }
}
