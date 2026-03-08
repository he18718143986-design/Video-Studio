import type {
  CapabilityAssessment,
  CapabilityField,
  StyleDNA,
  RawStyleDNAResponse,
  RawStyleDNAField,
  ConfidenceLevel,
  Provider,
} from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import { calculateCost } from './observability';

const CAPABILITY_ASSESSMENT_PROMPT = `I am building a science explainer video style transfer tool.

PRODUCT OVERVIEW:
- Input: one viral 3D animated science explainer video + a new topic
- Output: a new video that replicates the original video's style
- Video type: 3D animated science short-form content (60-300 seconds)
- Each voiceover sentence maps to one independent 3D animation scene

FULL GENERATION PIPELINE:
StyleDNA Extraction → Script Generation → Compliance Check →
Scene Decomposition → Visual Prompt Generation → Keyframe Generation
→ Image-to-Video → BGM Generation → TTS Voiceover → FFmpeg Assembly

STYLE DNA SERVES THREE DOWNSTREAM PIPELINES:
- Script pipeline: constrains narrative structure, sentence style,
  and pacing for the text LLM generating new scripts
- Visual pipeline: constrains image generation model for keyframes
  and video generation model for animated clips
- Audio pipeline: constrains music generation model for BGM mood and style

FIELD DESIGN REQUIREMENTS:
1. Each field must be labeled with which pipeline it serves (script / visual / audio)
2. Every field must directly convert into a hard constraint for the corresponding
   downstream tool. Purely analytical fields with no downstream use are worthless.
3. Visual pipeline fields must be directly usable as prompt keywords for image
   and video generation models
4. Audio pipeline fields must be directly usable as prompt keywords for music
   generation models
5. Fields must only contain what you can accurately extract by watching the video.
   Do not include fields that require guessing or subjective judgment.
6. Minimum sufficient fields only. No over-engineering.

BEFORE I ASK YOU TO EXTRACT THE DNA, please answer these five questions
about your own capabilities as the sole executor of this task:

Q1. For the SCRIPT pipeline:
    Which fields can you extract accurately from a video, and in what format?
    Be specific about what you can observe directly versus what you are inferring.

Q2. For the VISUAL pipeline:
    Which fields can you extract accurately, and which fields are directly usable
    as image/video generation prompt keywords?

Q3. For the AUDIO pipeline:
    Which fields can you extract accurately, and which fields are directly usable
    as music generation prompt keywords?

Q4. CONFIDENCE SELF-ASSESSMENT:
    For each field you propose, explicitly state:
    - "confident" if you can extract it reliably from visual/audio observation
    - "inferred" if you are making an educated guess based on common patterns
      for this video type
    Tell me WHY for each rating.

Q5. BLIND SPOTS:
    Are there any fields you could extract from this video that I have NOT asked
    about, but that would have significant impact on downstream generation quality?

Output your answer as a structured assessment, NOT as JSON.
Use plain text with clear section headers.
This is a dialogue, not an extraction task.`;

function buildExtractionPrompt(assessment: CapabilityAssessment): string {
  const allFields = [
    ...assessment.scriptFields.map((f) => `  [SCRIPT] ${f.fieldName} (${f.confidence}): ${f.downstreamUsage}`),
    ...assessment.visualFields.map((f) => `  [VISUAL] ${f.fieldName} (${f.confidence}): ${f.downstreamUsage}`),
    ...assessment.audioFields.map((f) => `  [AUDIO] ${f.fieldName} (${f.confidence}): ${f.downstreamUsage}`),
  ].join('\n');

  return `Now, watch the attached video and extract the Style DNA.

EXTRACTION RULES:
- Extract ONLY fields from the confirmed capability list below.
- For each "confident" field: provide the value directly.
- For each "inferred" field: provide the value AND a confidence score (0.0-1.0)
  AND a one-sentence justification.
- If the video has NO spoken voiceover (only music/sfx), set
  scriptPipeline: null and explain why.
- Do not invent values. If you cannot determine a field, set it to null
  and state the reason.

CONFIRMED FIELDS TO EXTRACT (derived from your self-assessment):
${allFields}

OUTPUT FORMAT: Strict JSON matching this schema. Every field must include:
{
  "value": <extracted value>,
  "confidence": "confident" | "inferred",
  "score": <0.0-1.0, only required for "inferred" fields>,
  "evidence": "<timestamp or observation that supports this value>"
}

Wrap the entire output in a JSON object with three top-level keys:
{
  "scriptPipeline": { ... } or null,
  "visualPipeline": { ... },
  "audioPipeline": { ... }
}

Return ONLY valid JSON, no markdown code fences.`;
}

export async function runCapabilityAssessment(
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ assessment: CapabilityAssessment; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_2a_capability_assessment', availableProviders);

  let text: string;
  let inputTokens = 0;
  let outputTokens = 0;

  if (provider === 'google') {
    const result = await geminiAdapter.generateText({
      model,
      prompt: CAPABILITY_ASSESSMENT_PROMPT,
      apiKey: apiKeys?.['google'],
    });
    text = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } else {
    throw new Error('Capability assessment requires Google AI (video understanding)');
  }

  const costUsd = calculateCost(model, { inputTokens, outputTokens });
  const assessment = parseCapabilityAssessment(text);

  return { assessment, costUsd, model };
}

function parseCapabilityAssessment(rawText: string): CapabilityAssessment {
  const scriptFields: CapabilityField[] = [];
  const visualFields: CapabilityField[] = [];
  const audioFields: CapabilityField[] = [];
  const blindSpots: string[] = [];

  const defaultScriptFields: CapabilityField[] = [
    { fieldName: 'tone', pipeline: 'script', confidence: 'confident', reason: 'Observable from voiceover delivery style', downstreamUsage: 'Sets tone parameter for script generation' },
    { fieldName: 'vocabularyLevel', pipeline: 'script', confidence: 'confident', reason: 'Observable from word complexity in voiceover', downstreamUsage: 'Constrains vocabulary complexity in generated script' },
    { fieldName: 'metaphorDensity', pipeline: 'script', confidence: 'confident', reason: 'Countable metaphors per minute', downstreamUsage: 'Controls analogy frequency in generated script' },
    { fieldName: 'sentenceRhythm', pipeline: 'script', confidence: 'inferred', reason: 'Estimated from pacing patterns', downstreamUsage: 'Guides sentence length variation' },
    { fieldName: 'language', pipeline: 'script', confidence: 'confident', reason: 'Directly identifiable from audio', downstreamUsage: 'Language selection for script and TTS' },
    { fieldName: 'openingHookPattern', pipeline: 'script', confidence: 'confident', reason: 'Observable from first 10 seconds', downstreamUsage: 'Template for opening scene structure' },
    { fieldName: 'closingHookPattern', pipeline: 'script', confidence: 'confident', reason: 'Observable from final scene', downstreamUsage: 'Template for closing scene structure' },
    { fieldName: 'wordsPerMinute', pipeline: 'script', confidence: 'confident', reason: 'Calculable from transcript and duration', downstreamUsage: 'Pacing control for script length' },
    { fieldName: 'narrativeStructure', pipeline: 'script', confidence: 'confident', reason: 'Observable scene-by-scene beat structure', downstreamUsage: 'Defines beat sequence for narrative map' },
  ];

  const defaultVisualFields: CapabilityField[] = [
    { fieldName: 'colorGrading', pipeline: 'visual', confidence: 'confident', reason: 'Observable from frame analysis', downstreamUsage: 'Color grading prompt keywords' },
    { fieldName: 'lighting', pipeline: 'visual', confidence: 'confident', reason: 'Observable from shadows and highlights', downstreamUsage: 'Lighting description for image generation' },
    { fieldName: 'cameraMotionPatterns', pipeline: 'visual', confidence: 'confident', reason: 'Observable from video motion', downstreamUsage: 'Camera motion instructions per scene' },
    { fieldName: 'compositionRules', pipeline: 'visual', confidence: 'inferred', reason: 'Estimated from framing patterns', downstreamUsage: 'Composition guidelines for image generation' },
    { fieldName: 'transitionTypes', pipeline: 'visual', confidence: 'confident', reason: 'Observable between scenes', downstreamUsage: 'Transition type selection in video assembly' },
    { fieldName: 'renderingStyle', pipeline: 'visual', confidence: 'confident', reason: 'Observable from visual aesthetics', downstreamUsage: 'Primary style keyword for image/video generation' },
    { fieldName: 'palette', pipeline: 'visual', confidence: 'confident', reason: 'Extractable from dominant colors', downstreamUsage: 'Color palette constraint for image generation' },
  ];

  const defaultAudioFields: CapabilityField[] = [
    { fieldName: 'musicStyle', pipeline: 'audio', confidence: 'inferred', reason: 'Estimated from background audio', downstreamUsage: 'Music generation prompt keyword' },
    { fieldName: 'musicMood', pipeline: 'audio', confidence: 'inferred', reason: 'Estimated from audio atmosphere', downstreamUsage: 'Mood parameter for music generation' },
    { fieldName: 'sfxStyle', pipeline: 'audio', confidence: 'inferred', reason: 'Estimated from sound effects presence', downstreamUsage: 'SFX style selection' },
    { fieldName: 'voicePacing', pipeline: 'audio', confidence: 'confident', reason: 'Measurable from voiceover speed', downstreamUsage: 'TTS speed parameter' },
  ];

  const sections = rawText.split(/(?:Q[1-5]|BLIND SPOTS|Section)/i);

  let hasScriptContent = false;
  let hasVisualContent = false;
  let hasAudioContent = false;

  for (const section of sections) {
    const lower = section.toLowerCase();
    if (lower.includes('script') && lower.includes('pipeline')) hasScriptContent = true;
    if (lower.includes('visual') && lower.includes('pipeline')) hasVisualContent = true;
    if (lower.includes('audio') && lower.includes('pipeline')) hasAudioContent = true;
  }

  scriptFields.push(...(hasScriptContent ? extractFieldsFromText(rawText, 'script', defaultScriptFields) : defaultScriptFields));
  visualFields.push(...(hasVisualContent ? extractFieldsFromText(rawText, 'visual', defaultVisualFields) : defaultVisualFields));
  audioFields.push(...(hasAudioContent ? extractFieldsFromText(rawText, 'audio', defaultAudioFields) : defaultAudioFields));

  const blindSpotSection = rawText.match(/(?:Q5|BLIND SPOTS)[.\s\S]*?(?=$|\nQ\d)/i);
  if (blindSpotSection) {
    const lines = blindSpotSection[0].split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('•'));
    for (const line of lines) {
      blindSpots.push(line.replace(/^[-•]\s*/, '').trim());
    }
  }

  return {
    scriptFields,
    visualFields,
    audioFields,
    blindSpots,
    hasVoiceAudio: null,
    rawAssessmentText: rawText,
  };
}

function extractFieldsFromText(
  text: string,
  pipeline: 'script' | 'visual' | 'audio',
  defaults: CapabilityField[]
): CapabilityField[] {
  const fields: CapabilityField[] = [];

  for (const defaultField of defaults) {
    const fieldLower = defaultField.fieldName.toLowerCase();
    const isConfident = text.toLowerCase().includes(`${fieldLower}`) &&
      (text.toLowerCase().includes('confident') || text.toLowerCase().includes('directly'));

    fields.push({
      ...defaultField,
      confidence: isConfident ? 'confident' : defaultField.confidence,
    });
  }

  return fields;
}

export async function extractStyleDNA(
  videoPath: string | undefined,
  videoUrl: string | undefined,
  assessment: CapabilityAssessment,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ styleDNA: StyleDNA; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_2b_style_dna', availableProviders);

  if (provider !== 'google') {
    throw new Error('Style DNA extraction requires Google AI (video understanding)');
  }

  const prompt = buildExtractionPrompt(assessment);
  let text: string;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const result = await geminiAdapter.generateTextWithVideo({
      model,
      prompt,
      videoPath,
      videoUrl,
      apiKey: apiKeys?.['google'],
    });
    text = result.text;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  } catch (error) {
    const fallbackDNA = buildFallbackStyleDNA(assessment);
    return {
      styleDNA: fallbackDNA,
      costUsd: 0,
      model,
    };
  }

  const costUsd = calculateCost(model, { inputTokens, outputTokens });

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const raw = JSON.parse(cleaned) as RawStyleDNAResponse;
    const styleDNA = buildStyleDNA(raw, assessment);
    return { styleDNA, costUsd, model };
  } catch {
    const fallbackDNA = buildFallbackStyleDNA(assessment);
    return { styleDNA: fallbackDNA, costUsd, model };
  }
}

function extractFieldValue<T>(field: RawStyleDNAField | undefined, defaultValue: T): T {
  if (!field || field.value === null || field.value === undefined) return defaultValue;
  return field.value as T;
}

function buildStyleDNA(raw: RawStyleDNAResponse, assessment: CapabilityAssessment): StyleDNA {
  const scriptFields = raw.scriptPipeline;
  const visualFields = raw.visualPipeline;
  const audioFields = raw.audioPipeline;

  const evidence: Record<string, { timestamp: string; confidence: number; observation: string }> = {};

  function processField(name: string, field: RawStyleDNAField | undefined): void {
    if (field) {
      evidence[name] = {
        timestamp: typeof field.evidence === 'string' ? field.evidence : 'N/A',
        confidence: field.score ?? (field.confidence === 'confident' ? 1.0 : 0.5),
        observation: typeof field.evidence === 'string' ? field.evidence : 'Extracted from video',
      };
    }
  }

  if (scriptFields) {
    Object.entries(scriptFields).forEach(([key, val]) => processField(`script.${key}`, val));
  }
  Object.entries(visualFields).forEach(([key, val]) => processField(`visual.${key}`, val));
  Object.entries(audioFields).forEach(([key, val]) => processField(`audio.${key}`, val));

  const visualTier: Record<string, ConfidenceLevel> = {};
  for (const [key, val] of Object.entries(visualFields)) {
    visualTier[key] = val.confidence;
  }

  const audioTier: Record<string, ConfidenceLevel> = {};
  for (const [key, val] of Object.entries(audioFields)) {
    audioTier[key] = val.confidence;
  }

  let tier1Count = 0;
  let totalRequired = 0;
  const allRawFields = { ...visualFields, ...audioFields, ...(scriptFields ?? {}) };
  for (const field of Object.values(allRawFields)) {
    totalRequired++;
    if (field.confidence === 'confident' && (field.score ?? 1.0) >= 0.8) {
      tier1Count++;
    }
  }
  const degraded = totalRequired > 0 && (tier1Count / totalRequired) < 0.7;

  const scriptPipeline = scriptFields
    ? {
        tone: extractFieldValue(scriptFields['tone'], 'engaging, educational'),
        vocabularyLevel: extractFieldValue(scriptFields['vocabularyLevel'], 'intermediate') as 'elementary' | 'intermediate' | 'expert',
        metaphorDensity: extractFieldValue(scriptFields['metaphorDensity'], 'medium') as 'low' | 'medium' | 'high',
        sentenceRhythm: extractFieldValue(scriptFields['sentenceRhythm'], 'varied'),
        language: extractFieldValue(scriptFields['language'], 'en-US'),
        openingHookPattern: extractFieldValue(scriptFields['openingHookPattern'], 'provocative question'),
        closingHookPattern: extractFieldValue(scriptFields['closingHookPattern'], 'call to action'),
        wordsPerMinute: extractFieldValue(scriptFields['wordsPerMinute'], 150),
        narrativeStructure: extractFieldValue(scriptFields['narrativeStructure'], [
          'hook', 'context', 'core_explanation', 'deep_dive', 'misconception', 'conclusion', 'cta',
        ]),
      }
    : null;

  return {
    degraded,
    fallbackReason: degraded ? 'low_confidence' : null,
    capabilityAssessment: assessment,
    scriptPipeline,
    visualPipeline: {
      colorGrading: extractFieldValue(visualFields['colorGrading'], 'vibrant, high-contrast'),
      lighting: extractFieldValue(visualFields['lighting'], 'soft ambient with rim lighting'),
      cameraMotionPatterns: extractFieldValue(visualFields['cameraMotionPatterns'], ['slow push-in', 'orbital', 'static wide']),
      compositionRules: extractFieldValue(visualFields['compositionRules'], ['center-weighted', 'rule of thirds']),
      transitionTypes: extractFieldValue(visualFields['transitionTypes'], ['smooth dissolve', 'cut']),
      renderingStyle: extractFieldValue(visualFields['renderingStyle'], '3D rendered, educational animation'),
      palette: extractFieldValue(visualFields['palette'], ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#533483']),
      tier: visualTier,
    },
    audioPipeline: {
      musicStyle: extractFieldValue(audioFields['musicStyle'], 'ambient electronic'),
      musicMood: extractFieldValue(audioFields['musicMood'], 'curious, wonder'),
      sfxStyle: extractFieldValue(audioFields['sfxStyle'], 'subtle sci-fi whooshes'),
      voicePacing: extractFieldValue(audioFields['voicePacing'], 150),
      tier: audioTier,
    },
    evidence,
  };
}

function buildFallbackStyleDNA(assessment: CapabilityAssessment): StyleDNA {
  return {
    degraded: true,
    fallbackReason: 'video_understanding_unavailable',
    capabilityAssessment: assessment,
    scriptPipeline: {
      tone: 'engaging, educational, wonder-inducing',
      vocabularyLevel: 'intermediate',
      metaphorDensity: 'medium',
      sentenceRhythm: 'varied with short punchy sentences followed by longer explanations',
      language: 'en-US',
      openingHookPattern: 'provocative question or surprising fact',
      closingHookPattern: 'call to action with mind-blowing closing fact',
      wordsPerMinute: 150,
      narrativeStructure: ['hook', 'context', 'core_explanation', 'deep_dive', 'misconception', 'conclusion', 'cta'],
    },
    visualPipeline: {
      colorGrading: 'vibrant, high-contrast, science-aesthetic',
      lighting: 'soft ambient with dramatic rim lighting',
      cameraMotionPatterns: ['slow push-in', 'orbital rotation', 'static wide shot'],
      compositionRules: ['center-weighted subject', 'rule of thirds for text'],
      transitionTypes: ['smooth dissolve', 'zoom transition', 'cut'],
      renderingStyle: '3D rendered, photorealistic educational animation',
      palette: ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#533483'],
      tier: {},
    },
    audioPipeline: {
      musicStyle: 'ambient electronic, cinematic',
      musicMood: 'curious, wonder, discovery',
      sfxStyle: 'subtle sci-fi whooshes and UI sounds',
      voicePacing: 150,
      tier: {},
    },
    evidence: {},
  };
}
