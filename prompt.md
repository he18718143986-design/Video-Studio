# Prompt for Claude Opus 4.6 — AI Animated Science Video Generator (Full Project)

## Your Role

You are a senior full-stack engineer and AI systems architect. Your task is to build a **complete, production-ready web application** from scratch. Do not ask clarifying questions — all decisions are fully specified below. Begin by outputting the complete project file tree, then implement every single file in full.

---

## Project Overview

Build an AI-powered web application that:
1. Accepts a **reference science animation video** (local file upload OR YouTube/video URL)
2. Analyzes the video's style — visual language, narrative structure, metaphor patterns, pacing, tone
3. Accepts a **new topic** from the user (e.g., "how kidneys work")
4. Generates a **complete new science animation video** in the same style as the reference, covering the new topic

The final output is a fully rendered MP4 video with synchronized voiceover, animated scenes, and burned-in subtitles — available for in-browser preview and download.

---

## Full Agentic Workflow — 13-Step Hybrid Pipeline

The backend is a multi-phase AI pipeline. Implement every step exactly as described. No steps may be omitted or stubbed.

---

### Phase 1 — Safety & Analysis (Steps 1–3)

**Step 1 — Safety Pre-check**
- Model: `fast_reasoning` capability (see Model Registry)
- Role: Content safety classifier
- Input: user-provided topic string
- Prompt core: `"Is the topic '${topic}' related to medical advice, self-harm, dangerous procedures, or high-risk personal health guidance? Return EXACT JSON: { isFlagged: boolean, reason: string, safeAlternative: string | null }"`
- If `isFlagged: true`: surface the `safeAlternative` to the user and block pipeline start
- Output: `SafetyResult` type

**Step 2 — Style DNA Extraction (Two-Phase: Capability Self-Assessment → Extraction)**
- Model: `video_understanding` capability (thinking budget enabled)
- Input: reference video (file or URL)
- **This step is implemented as two sequential model calls (2a and 2b).**

---

#### Step 2a — Model Capability Self-Assessment (runs BEFORE video is analyzed)

This call does NOT send the video yet. It sends only the product context and asks the model to declare its own capability boundaries before being trusted with the extraction task. This makes the pipeline model-agnostic: the same two prompts work whether the executor is Gemini 3 Pro, GPT-4o, or any future multimodal model.

**Prompt 2a** (send as plain text, no video attached):

```
I am building a science explainer video style transfer tool.

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
This is a dialogue, not an extraction task.
```

**Parse 2a response into a `CapabilityAssessment` object:**
```typescript
interface CapabilityAssessment {
  scriptFields: CapabilityField[];
  visualFields: CapabilityField[];
  audioFields: CapabilityField[];
  blindSpots: string[];
  hasVoiceAudio: boolean | null;   // null = not yet determined, detected in 2b
}

interface CapabilityField {
  fieldName: string;
  pipeline: 'script' | 'visual' | 'audio';
  confidence: 'confident' | 'inferred';
  reason: string;
  downstreamUsage: string;         // how this field constrains the downstream tool
}
```

Parse the plain-text self-assessment into this structure programmatically. Store it alongside the final StyleDNA for observability and debugging.

---

#### Step 2b — StyleDNA Extraction (runs AFTER self-assessment)

Now send the video. The extraction prompt is dynamically constructed using the `CapabilityAssessment` from 2a — only fields rated `"confident"` are extracted as hard values; `"inferred"` fields are extracted with an explicit `confidence` score attached.

**Prompt 2b** (send with video attached):

```
Now, watch the attached video and extract the Style DNA.

EXTRACTION RULES:
- Extract ONLY fields from the confirmed capability list below.
- For each "confident" field: provide the value directly.
- For each "inferred" field: provide the value AND a confidence score (0.0–1.0)
  AND a one-sentence justification.
- If the video has NO spoken voiceover (only music/sfx), set
  scriptPipeline: null and explain why.
- Do not invent values. If you cannot determine a field, set it to null
  and state the reason.

CONFIRMED FIELDS TO EXTRACT (derived from your self-assessment):
[dynamically injected: list of all fields from CapabilityAssessment,
grouped by pipeline, with their confidence tier]

OUTPUT FORMAT: Strict JSON matching the StyleDNA schema.
Every field must include:
{
  "value": <extracted value>,
  "confidence": "confident" | "inferred",
  "score": <0.0–1.0, only required for "inferred" fields>,
  "evidence": "<timestamp or observation that supports this value>"
}
```

**Output:** Raw `StyleDNA` JSON from the model.

---

#### Post-processing after Step 2b

```typescript
// services/analysis.ts

function buildStyleDNA(raw: RawStyleDNAResponse, assessment: CapabilityAssessment): StyleDNA {
  // 1. Validate all required fields are present
  // 2. Separate fields into three tiers:
  //    Tier 1: confidence === 'confident' && score >= 0.8  → used as hard constraints
  //    Tier 2: confidence === 'inferred'  && score >= 0.5  → used as soft hints with caveats
  //    Tier 3: score < 0.5 or value === null               → excluded from downstream, flagged in UI
  // 3. Set styleDNA.degraded = true if >30% of Tier 1 fields are missing
  // 4. If scriptPipeline === null (no voiceover detected):
  //    - Set styleDNA.scriptPipeline = null
  //    - Emit a blocking UI warning: "No voiceover detected in reference video.
  //      Script style extraction is unavailable. The generated script will use
  //      default style parameters. Do you want to continue?"
  return validatedStyleDNA;
}
```

---

#### Degraded Fallback Path (if Step 2b fails entirely)

Trigger only if the model call itself errors (not just low-confidence fields):
1. Extract audio track → transcribe with Whisper (OpenAI) or `whisper.cpp` (local)
2. Extract 1 frame/second → send frames to `image_understanding` provider
3. Synthesize partial StyleDNA from transcript + frame descriptions
4. Set `styleDNA.degraded = true` + `styleDNA.fallbackReason = 'video_understanding_unavailable'`
5. Display prominent warning in UI: reduced style fidelity expected

**Step 3 — Deep Research**
- Model: `fast_reasoning` capability with **Google Search grounding tool enabled**
- Role: Scientific researcher and fact-checker
- Input: new topic string + StyleDNA narrative structure
- Prompt core: `"Research the topic '${topic}' rigorously. Produce a structured fact sheet with: (1) 5–7 distinct verifiable facts mapped to the narrative arc from StyleDNA, (2) 3 common misconceptions to debunk, (3) 3–4 key technical terms with simple definitions, (4) 2–3 concrete analogies suitable for the vocabulary level '${styleDNA.scriptStyle.vocabularyLevel}'"`
- Output: `ResearchReport` type with `facts[]`, `misconceptions[]`, `terms[]`, `analogies[]`

---

### Phase 2 — Script Generation (Steps 4–6)

**Step 4 — Narrative Map Generation (Scene-Level Production Contract)**
- Model: `text_reasoning` capability (Gemini 3 Pro)
- Role: Content strategist + pre-production supervisor
- Input: `ResearchReport` + `StyleDNA`
- This step produces a **scene-level production contract** — not a loose outline, but a fully pre-decided scene specification that locks in all content and style decisions *before* the script writer touches it. The goal is to reduce the script generation step (Step 5) to a single constrained task: "expand these contracts into fluent voiceover sentences."

**Prompt core:**
```
You are a pre-production supervisor for a science explainer video series.
Your job is to produce a Scene Production Contract for each scene of the new video.

A Scene Production Contract is NOT a summary or outline.
It is a binding specification that the script writer must follow exactly.
Every decision that can be made now MUST be made now —
the script writer should have zero structural decisions left to make.

For each scene, produce:

1. BEAT
   The narrative function of this scene.
   Must map directly to a beat from the reference video's narrative structure: ${styleDNA.scriptPipeline.narrativeStructure}

2. VOICEOVER_DRAFT
   A one-sentence draft of the voiceover for this scene.
   Write it in the target vocabulary level: ${styleDNA.scriptPipeline.vocabularyLevel}
   This is a binding draft — the script writer expands it, never replaces it.

3. FACTS_BOUND
   The specific fact(s) from the ResearchReport that this scene must convey.
   Each fact must appear in exactly one scene — no duplication across scenes.

4. ANALOGY_BOUND
   The specific analogy assigned to this scene, if any.
   Pull from ResearchReport.analogies[]. Assign null if this beat does not require one.
   Analogy density across all scenes must match: ${styleDNA.scriptPipeline.metaphorDensity}

5. STYLE_CONSTRAINTS
   Per-scene style rules extracted from the reference video for THIS specific beat:
   - sentencePattern: the sentence structure the reference video uses at this beat
     (e.g., "rhetorical question → short answer", "declarative → metaphor expansion")
   - toneShift: emotional direction relative to previous scene
     (e.g., "escalate urgency", "release tension", "neutral → wonder")
   - metaphorRequired: boolean — must this scene contain a metaphor or analogy?
   - maxSentenceCount: hard ceiling on number of sentences for this scene

6. ESTIMATED_DURATION_SEC
   Calculated from VOICEOVER_DRAFT length.
   Chinese: 0.3s/character. English: 2.5 words/second.
   All scenes must sum to within ±5% of target video duration: ${targetDurationSec}s

CONSTRAINTS:
- Total scene count must equal: ${calculatedSceneCount}
- First scene must implement opening hook pattern: ${styleDNA.scriptPipeline.openingHookPattern}
- Last scene must implement closing hook pattern: ${styleDNA.scriptPipeline.closingHookPattern}
- Every fact in ResearchReport.facts[] must be assigned to exactly one scene
- Every misconception in ResearchReport.misconceptions[] must be addressed
- Output as JSON array of NarrativeMapScene objects
```

- Output: `NarrativeMap` type — array of `NarrativeMapScene` objects (see types)

---

**Step 5 — Script Draft Generation**
- Model: `text_reasoning` capability (Gemini 3 Pro)
- System prompt:
```
You are the original creator of the reference video.
Your job is to expand Scene Production Contracts into final voiceover sentences.
You are NOT making structural decisions — those are already locked in the contracts.
Your only job is fluency, rhythm, and voice consistency.

Rules:
- Never deviate from BEAT, FACTS_BOUND, or ANALOGY_BOUND in each contract
- Expand VOICEOVER_DRAFT into full sentences — do not replace it, build from it
- Respect STYLE_CONSTRAINTS.sentencePattern exactly
- Do not exceed STYLE_CONSTRAINTS.maxSentenceCount per scene
- Maintain consistent tone across scenes as directed by STYLE_CONSTRAINTS.toneShift
- Voice: ${styleDNA.scriptPipeline.tone}
- Vocabulary: ${styleDNA.scriptPipeline.vocabularyLevel}
- Metaphor density: ${styleDNA.scriptPipeline.metaphorDensity}
```
- Input: `NarrativeMap` (production contracts) + `StyleDNA.scriptPipeline`
- The script writer receives pre-decided contracts, not open-ended instructions. Decision space is intentionally narrow.
- Output: `Script` type with `scenes[]`, each containing `{ sceneIndex, beat, voiceover, wordCount, estimatedDurationSec }`

**Step 6 — QA Audit + Script Safety Re-check**
- Model: `fast_reasoning` capability (single call, two-in-one)
- Role: QA reviewer + content safety auditor
- Input: full script text + `ResearchReport` + `StyleDNA`
- Check A (Quality): All facts from `ResearchReport` are present; style matches `StyleDNA`; no hallucinated claims; length within ±10% of target duration
- Check B (Safety): No policy violations, no dangerous instructions embedded in metaphors
- Output: `{ qualityPass: boolean, safetyPass: boolean, issues: string[], revisedScript: Script | null }`
- If `qualityPass: false`: return `revisedScript` with corrections applied inline (do not loop back — fix in same call)
- If `safetyPass: false`: block pipeline, surface issues to user

---

### Phase 3 — Storyboard Design (Step 7)

**Step 7 — Storyboard Generation + Subject Isolation Check**
- Model: `text_reasoning` capability (Gemini 3 Pro)
- Role: Master educational video director
- Input: final script + `StyleDNA` visual profile
- This is a single call that does two things:
  1. **Generate storyboard**: split script into `calculatedSceneCount` scenes (see Planning section), and for each scene produce:
     - `visualPrompt`: detailed AI image/video generation prompt
     - `cameraMotion`: specific motion instruction (e.g., "slow push-in from wide to medium", "static wide shot")
     - `keyElements`: array of must-include visual elements
     - `estimatedDuration`: calculated from text length (Chinese ~0.3s/char, English ~2.5 words/s)
     - `beat`: narrative beat this scene serves
  2. **Subject isolation check**: for each scene, verify the visual subject is unambiguous and suitable for generation models. If ambiguous, rewrite `visualPrompt` inline before outputting
- Output: `Storyboard` type — array of fully validated `StoryboardScene` objects

---

### Phase 4 — Visual Production (Steps 8–10)

**Step 8 — Style Reference Sheet Generation**
- Model: `image_generation` capability (Gemini 3 Pro Image; fallback: Gemini 2.5 Flash Image)
- Input: `StyleDNA` visual profile
- Generate a single "style bible" reference image showing: color palette swatches, lighting mood, material/texture feel, representative 3D object rendering style, spatial composition example
- This image is stored in GCS and passed as context to all subsequent image generation calls
- Output: `referenceSheetUrl: string`

**Step 9 — Scene Keyframe Generation**
- Model: `image_generation` capability (Gemini 3 Pro Image; fallback: Gemini 2.5 Flash Image)
- Input: per-scene `visualPrompt` + `keyElements` + `StyleDNA` palette + reference sheet image
- For each scene: generate a keyframe image that will serve as the first frame of the video clip
- Run all scenes through `PromisePool` with **concurrency limit of 3**
- Output: per-scene `keyframeUrl: string`

**Step 10 — Scene Video Generation**
- Model: `video_generation` capability (Veo 3 Fast default; Veo 3 if quality=high)
- Primary path — Image-to-Video (I2V):
  - Input: keyframe image + `visualPrompt` + `cameraMotion`
- Fallback path — Text-to-Video (T2V, triggered when I2V fails):
  - Inject full style context: `${visualPrompt}\n${cameraMotion}\nStyle: ${styleNote}\nTone: ${toneNote}\nKey elements: ${keyElements.join(', ')}\nColor palette: ${palette.join(', ')}\nKeep motion natural and consistent with the reference style.`
  - Set `usedT2vFallback: true` on the scene — display indicator in UI
- Run all scenes through `PromisePool` with **concurrency limit of 3**
- Output: per-scene `videoUrl: string`

---

### Phase 5 — Audio & Rendering (Steps 11–12)

**Step 11 — TTS Voice Generation**
- Model: `tts` capability (Gemini TTS default; ElevenLabs if configured — see Model Registry)
- Input: per-scene voiceover text
- Auto-detect script language; select voice matching language and tone from `StyleDNA`
- Generate per-scene audio file (MP3), upload to GCS
- Output: per-scene `audioUrl: string`, `audioDurationSec: number`

**Step 12 — Video Rendering + Audio-Driven Alignment**
- Tool: FFmpeg (server-side, not an AI call)
- This is the final assembly step. Implement the **audio-driven alignment strategy exactly**:

```typescript
// services/videoRenderer.ts — implement this logic precisely

async function renderScene(scene: StoryboardScene): Promise<string> {
  // 1. Audio is the source of truth for duration
  let duration = scene.estimatedDuration || 5;
  if (scene.audioUrl) {
    const audioBuffer = await loadAudioBuffer(scene.audioUrl);
    duration = audioBuffer.duration; // override with actual audio duration
  }
  duration = Math.max(duration, 2); // enforce 2s minimum

  // 2. If video asset is shorter than audio duration:
  if (scene.videoUrl) {
    const videoDuration = await getVideoDuration(scene.videoUrl);
    if (videoDuration < duration) {
      // Loop video OR freeze-frame the last frame to fill remaining duration
      return await ffmpegLoopVideo(scene.videoUrl, scene.audioUrl, duration);
    }
    return await ffmpegMergeVideoAudio(scene.videoUrl, scene.audioUrl, duration);
  }

  // 3. If only keyframe image available (no video):
  if (scene.keyframeUrl) {
    // Apply zoom-in (Ken Burns) effect across the full audio duration
    return await ffmpegImageToVideo(scene.keyframeUrl, scene.audioUrl, duration, 'zoom-in');
  }

  throw new Error(`Scene ${scene.index} has no video or image asset`);
}

async function renderFinalVideo(scenes: StoryboardScene[]): Promise<string> {
  // Render each scene, then concatenate + burn subtitles
  const sceneVideos = await Promise.all(scenes.map(renderScene));
  const concatenated = await ffmpegConcatenate(sceneVideos);
  const withSubtitles = await ffmpegBurnSubtitles(concatenated, scenes);
  return await uploadToGCS(withSubtitles);
}
```

---

### Phase 6 — On-Demand Refinement (Step 13)

**Step 13 — Unified Refinement**
- Model: `text_reasoning` capability (Gemini 3 Pro)
- This step handles all three user-triggered refinement actions through a single service with a `mode` parameter:

```typescript
type RefinementMode = 'full_script' | 'single_scene' | 'visual_prompts';

// Mode: full_script
// Input: full script + user feedback text
// Output: rewritten full script preserving StyleDNA

// Mode: single_scene
// Input: single scene voiceover + user feedback
// Output: rewritten voiceover for that scene only

// Mode: visual_prompts
// Input: full storyboard + user feedback
// Output: batch-updated visual prompts for affected scenes only
```

- Always preserves `StyleDNA` constraints regardless of user feedback
- After any script refinement: automatically re-trigger Steps 11–12 for affected scenes only (partial re-render)

---

## Planning: Scene Count Calculation

Implement in `services/planning.ts`:

```typescript
export function calculateSceneCount(
  targetDurationSec: number,        // user-selected total video duration
  targetSceneDurationSec: number = 8 // average scene length
): number {
  return Math.ceil(targetDurationSec / targetSceneDurationSec);
}
// Example: 120s video ÷ 8s/scene = 15 scenes
// User can select: 60s (~8 scenes), 120s (~15 scenes), 180s (~23 scenes)
```

---

## Concurrency Control

Implement `PromisePool` in `lib/utils.ts`:

```typescript
export class PromisePool {
  private queue: Array<() => Promise<unknown>> = [];
  private active = 0;

  constructor(private readonly concurrency: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    // Block until a slot is available, then execute fn
    // Fully implement — no stubs
  }
}
// All visual production steps (Steps 9, 10) use: new PromisePool(3)
```

---

## Cost Tracking

Implement in `services/observability.ts`:

```typescript
// Track cost for every model call. Aggregate per project.
const COST_TABLE = {
  'gemini-3-pro':          { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
  'gemini-3-flash':        { inputPer1kTokens: 0.000075, outputPer1kTokens: 0.0003 },
  'gemini-3-pro-image':    { perImage: 0.04 },
  'veo-3-fast':            { perCall: 0.10 },
  'veo-3':                 { perCall: 0.35 },
  'gemini-tts':            { perCharacter: 0.000004 },
  'elevenlabs':            { perCharacter: 0.00003 },
  'openai-gpt4o':          { inputPer1kTokens: 0.0025, outputPer1kTokens: 0.01 },
  'openai-gpt4o-mini':     { inputPer1kTokens: 0.00015, outputPer1kTokens: 0.0006 },
  'claude-opus-4-5':       { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
  'claude-haiku':          { inputPer1kTokens: 0.00025, outputPer1kTokens: 0.00125 },
  'dall-e-3':              { perImage: 0.04 },
  'stable-diffusion-3':    { perImage: 0.035 },
  'kling-v1-5':            { perCall: 0.14 },
  'runway-gen3':           { perCall: 0.20 },
};

// Expose totalCostUsd via tRPC and SSE events (live updating during generation)
```

---

## Dynamic Model Selection System

**Never hardcode model names in pipeline services.** All model selection goes through `services/modelRegistry.ts`.

### Capability Types

```typescript
type Provider = 'google' | 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'kling' | 'runway';

type Capability =
  | 'video_understanding'  // native video file/URL input — currently only Google
  | 'image_understanding'  // image input support
  | 'text_reasoning'       // complex script/analysis generation
  | 'fast_reasoning'       // safety checks, QA, quick classification
  | 'image_generation'     // generate images from text/image prompts
  | 'video_generation'     // generate video clips
  | 'tts';                 // text-to-speech synthesis
```

### Capability Matrix

```typescript
const CAPABILITY_MATRIX: Record<Provider, Capability[]> = {
  google:     ['video_understanding', 'image_understanding', 'text_reasoning', 'fast_reasoning', 'image_generation', 'video_generation', 'tts'],
  openai:     ['image_understanding', 'text_reasoning', 'fast_reasoning', 'image_generation', 'tts'],
  anthropic:  ['image_understanding', 'text_reasoning', 'fast_reasoning'],
  elevenlabs: ['tts'],
  stability:  ['image_generation'],
  kling:      ['video_generation'],
  runway:     ['video_generation'],
};
```

### Step-to-Capability Map

```typescript
const STEP_REQUIREMENTS: Record<PipelineStep, {
  capability: Capability;
  preferred?: Provider;
}> = {
  step_1_safety:          { capability: 'fast_reasoning' },
  step_2_style_dna:       { capability: 'video_understanding', preferred: 'google' },
  step_3_research:        { capability: 'fast_reasoning',      preferred: 'google' }, // needs Search grounding
  step_4_narrative_map:   { capability: 'text_reasoning',      preferred: 'anthropic' },
  step_5_script:          { capability: 'text_reasoning',      preferred: 'anthropic' },
  step_6_qa_safety:       { capability: 'fast_reasoning' },
  step_7_storyboard:      { capability: 'text_reasoning' },
  step_8_reference_sheet: { capability: 'image_generation',    preferred: 'google' },
  step_9_keyframes:       { capability: 'image_generation',    preferred: 'google' },
  step_10_video:          { capability: 'video_generation',    preferred: 'google' },
  step_11_tts:            { capability: 'tts',                 preferred: 'elevenlabs' },
  step_13_refinement:     { capability: 'text_reasoning' },
};
```

### Model Map

```typescript
const MODEL_MAP: Record<Provider, Partial<Record<Capability, string>>> = {
  google: {
    video_understanding: 'gemini-3-pro-preview',
    image_understanding: 'gemini-3-pro-preview',
    text_reasoning:      'gemini-3-pro-preview',
    fast_reasoning:      'gemini-3-flash-preview',
    image_generation:    'gemini-3-pro-image-preview',
    video_generation:    'veo-3-fast-generate-preview', // overridden to 'veo-3-generate-preview' when quality=high
    tts:                 'gemini-3-tts-preview',
  },
  openai: {
    image_understanding: 'gpt-4o',
    text_reasoning:      'gpt-4o',
    fast_reasoning:      'gpt-4o-mini',
    image_generation:    'dall-e-3',
    tts:                 'tts-1-hd',
  },
  anthropic: {
    image_understanding: 'claude-opus-4-5',
    text_reasoning:      'claude-opus-4-5',
    fast_reasoning:      'claude-haiku-4-5-20251001',
  },
  elevenlabs: { tts: 'eleven_multilingual_v2' },
  stability:  { image_generation: 'stable-diffusion-3' },
  kling:      { video_generation: 'kling-v1-5' },
  runway:     { video_generation: 'gen3a_turbo' },
};
```

### Selection Logic

```typescript
// services/modelRegistry.ts
export function selectModel(
  step: PipelineStep,
  availableProviders: Record<Provider, boolean>,
  qualityOverride?: 'fast' | 'high'
): { provider: Provider; model: string } {
  const { capability, preferred } = STEP_REQUIREMENTS[step];

  // 1. Try preferred provider
  if (preferred && availableProviders[preferred]) {
    let model = MODEL_MAP[preferred][capability]!;
    // Quality override for video generation
    if (capability === 'video_generation' && qualityOverride === 'high' && preferred === 'google') {
      model = 'veo-3-generate-preview';
    }
    return { provider: preferred, model };
  }

  // 2. Try any available provider with required capability
  for (const [provider, caps] of Object.entries(CAPABILITY_MATRIX)) {
    if (availableProviders[provider as Provider] && caps.includes(capability)) {
      return { provider: provider as Provider, model: MODEL_MAP[provider as Provider][capability]! };
    }
  }

  // 3. No provider available — throw structured error
  throw new ModelUnavailableError(step, capability);
}
```

### Pre-flight Check

Before any pipeline run, call `preflightCheck(userApiKeys)`:
- Verify every step has at least one resolvable model
- If any step has no available provider: **block pipeline start**, return an array of `{ step, missingCapability, suggestedProvider }` errors — surface these to the user before they click "Generate"
- Return a "Model Plan" summary showing which model will be used for each step
- Allow per-step override from available options in Settings

### Video Understanding Degraded Path

If no `video_understanding` provider is available (no Google API key):
1. Extract audio via ffmpeg → transcribe with Whisper (OpenAI) or whisper.cpp (local)
2. Extract 1 frame/second from video → send frames to `image_understanding` provider
3. Synthesize `StyleDNA` from transcript + frame descriptions
4. Set `styleDNA.degraded = true` — display prominent warning in UI

---

## Tech Stack (Use Exactly)

### Frontend
- **Framework**: Next.js 14+ App Router
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Real-time progress**: Server-Sent Events (SSE)
- **Video player**: Video.js

### Backend
- **Runtime**: Node.js + TypeScript (strict mode, `noUncheckedIndexedAccess: true`)
- **API layer**: tRPC v11
- **Workflow orchestration**: Inngest — each of the 13 steps is a separate Inngest step function with retry config (`{ retries: 3, backoff: 'exponential' }`)
- **Job queue**: BullMQ + Redis (Upstash)
- **Video processing**: fluent-ffmpeg (server-side)

### Infrastructure
- **Database**: PostgreSQL via Supabase
- **Object storage**: Google Cloud Storage (all video, image, audio assets)
- **Cache**: Redis — StyleDNA cached by video SHA-256 hash (TTL: 7 days)
- **Frontend deploy**: Vercel
- **Backend deploy**: Railway
- **Observability**: Langfuse (every model call logged with: input, output, latency ms, token count, cost USD)

---

## Database Schema

```sql
-- Users (managed by Supabase Auth, extended here)
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- API Keys (encrypted at rest)
create table user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete cascade,
  provider text not null,  -- 'google' | 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'kling' | 'runway'
  encrypted_key text not null,
  created_at timestamptz default now(),
  unique(user_id, provider)
);

-- Projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete cascade,
  title text not null,
  reference_video_url text,         -- GCS URL (uploaded file) or YouTube URL
  new_topic text not null,
  target_duration_sec integer default 120,
  quality text default 'fast',      -- 'fast' | 'high'
  language text default 'auto',
  status text default 'pending',    -- pending|step_1|step_2|...|step_12|complete|failed
  current_step integer default 0,
  style_dna jsonb,
  capability_assessment jsonb,      -- Step 2a output, stored for debugging + observability
  research_report jsonb,
  narrative_map jsonb,
  script jsonb,
  storyboard jsonb,
  reference_sheet_url text,
  final_video_url text,
  total_cost_usd numeric(10, 4) default 0,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Scenes
create table scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  scene_index integer not null,
  beat text,
  voiceover_text text,
  visual_prompt text,
  camera_motion text,
  key_elements text[],
  estimated_duration_sec numeric(5, 2),
  actual_audio_duration_sec numeric(5, 2),
  audio_url text,
  keyframe_url text,
  video_url text,
  rendered_scene_url text,
  used_t2v_fallback boolean default false,
  status text default 'pending',    -- pending|generating_image|generating_video|generating_audio|rendered|failed
  created_at timestamptz default now(),
  unique(project_id, scene_index)
);

-- Pipeline Events (drives SSE progress stream)
create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  step_number integer not null,
  step_name text not null,
  status text not null,             -- started|completed|failed|skipped
  message text,
  cost_usd numeric(8, 4),
  model_used text,
  duration_ms integer,
  created_at timestamptz default now()
);

-- Indexes
create index on projects(user_id, created_at desc);
create index on scenes(project_id, scene_index);
create index on pipeline_events(project_id, created_at desc);
```

---

## User Account System

Implement using **Supabase Auth**:
- Email + password registration/login
- Google OAuth
- Protected routes via `middleware.ts` (redirect unauthenticated users to `/login`)
- Row-Level Security (RLS) policies on all tables — users can only access their own data
- Dashboard: paginated project list with status badge, thumbnail (first scene keyframe), topic, creation date, total cost
- Project detail: full pipeline view, scene editor, final video preview + download

---

## Multi-language Support

- Auto-detect language from reference video audio/subtitles (via Gemini or Whisper transcript)
- Generate new script in the same detected language
- Select TTS voice matching detected language:
  - Chinese (Mandarin): use `zh-CN` voice variant
  - English: use `en-US` voice variant
  - Extensible: add locale → voice mapping in `lib/voiceMap.ts`
- UI i18n: Chinese and English via `next-intl`
  - All pipeline step labels, error messages, and UI copy must be translated
  - Language auto-detected from browser; manually overridable in Settings

---

## UI/UX Requirements

### Pages

1. **`/` — Landing page**
   - Product hero with demo video embed
   - "How it works" section (3-step visual)
   - Call to action → `/register`

2. **`/login` and `/register` — Auth pages**
   - Email/password form
   - Google OAuth button
   - Forgot password flow

3. **`/dashboard` — Project dashboard**
   - Grid of project cards: thumbnail, topic, status badge, cost, date
   - "New Project" button → wizard
   - Empty state with onboarding prompt

4. **`/projects/new` — New Project wizard (3 steps)**
   - Step A: Upload video file (drag-drop, max 500MB) OR paste YouTube/video URL
   - Step B: Enter new topic + optional description
   - Step C: Configure — target duration (60/120/180s), quality (Fast/High), language override
   - Pre-flight check runs before submit: show Model Plan table or "missing API key" errors

5. **`/projects/[id]` — Project generation view**
   - **Pipeline progress tracker**: vertical stepper showing all 13 steps with status icons (pending/running/done/failed), active step highlighted, live step duration timer
   - **Cost meter**: live-updating USD counter
   - **Scene grid**: cards for each scene showing voiceover text, visual prompt, status badge, T2V fallback warning badge if applicable
   - **Script editor**: inline editable text per scene, "Refine with AI" button (triggers Step 13 `full_script` or `single_scene` mode)
   - **Storyboard editor**: editable visual prompt per scene, "Update Visuals" button (triggers Step 13 `visual_prompts` mode)
   - **Final video section** (shown when complete): Video.js player, download MP4 button, share link

6. **`/settings` — Settings page**
   - API key management per provider (masked input, test button)
   - After saving: live capability matrix table (rows = steps, columns = providers, cells = ✅/❌)
   - Per-step model override dropdowns
   - Default quality setting
   - Account management (change email, delete account)

### Design System
- Dark theme, deep space / science aesthetic
- Animated pipeline progress (step transitions with subtle glow effects)
- Scene cards: compact, scannable, color-coded by status
- All states handled: loading skeletons, error states with retry buttons, empty states
- Mobile-responsive (functional on tablet; desktop-optimized)

---

## Inngest Workflow Structure

Each pipeline step is an Inngest function. Implement in `inngest/functions/`:

```typescript
// Pattern for every step function:
export const stepN = inngest.createFunction(
  {
    id: 'step-N-name',
    retries: 3,
    // Steps 9, 10 (visual production): retries: 2 (expensive, limit retries)
  },
  { event: 'pipeline/step-N.requested' },
  async ({ event, step }) => {
    const { projectId } = event.data;

    await step.run('emit-started', async () => {
      await emitPipelineEvent(projectId, N, 'step_name', 'started');
    });

    const result = await step.run('execute', async () => {
      const model = selectModel('step_N', await getUserProviders(projectId));
      // ... execute step logic
      return result;
    });

    await step.run('persist', async () => {
      await persistStepResult(projectId, result);
    });

    await step.run('emit-completed', async () => {
      await emitPipelineEvent(projectId, N, 'step_name', 'completed', { costUsd: result.cost });
    });

    // Trigger next step
    await inngest.send({ name: 'pipeline/step-N+1.requested', data: { projectId } });
  }
);
```

---

## SSE Progress Streaming

Implement in `app/api/sse/[projectId]/route.ts`:
- On connection: replay all existing `pipeline_events` for the project (for page refresh recovery)
- Subscribe to new Supabase Realtime events on `pipeline_events` table filtered by `project_id`
- Push events to client as `data: ${JSON.stringify(event)}\n\n`
- Client (`store/projectStore.ts`): parse events, update Zustand state, trigger UI re-renders

---

## Environment Variables

Provide a complete `.env.example`:

```bash
# ── Google AI ──────────────────────────────────
GOOGLE_AI_API_KEY=

# ── OpenAI (optional) ─────────────────────────
OPENAI_API_KEY=

# ── Anthropic (optional) ──────────────────────
ANTHROPIC_API_KEY=

# ── ElevenLabs (optional, higher quality TTS) ─
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# ── Stability AI (optional image generation) ──
STABILITY_API_KEY=

# ── Kling (optional video generation) ─────────
KLING_API_KEY=

# ── Runway (optional video generation) ────────
RUNWAY_API_KEY=

# ── Supabase ───────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Google Cloud Storage ───────────────────────
GCS_BUCKET_NAME=
GCS_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=

# ── Redis / Upstash ────────────────────────────
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ── Inngest ────────────────────────────────────
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# ── Langfuse ───────────────────────────────────
LANGFUSE_SECRET_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com

# ── App Config ─────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
TTS_PROVIDER=gemini          # gemini | elevenlabs
VIDEO_QUALITY=fast           # fast | high
MAX_UPLOAD_SIZE_MB=500
ENCRYPTION_KEY=              # 32-byte hex key for API key encryption at rest
```

---

## Project File Structure

Generate and fully implement every file:

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── (app)/
│   │   ├── dashboard/page.tsx
│   │   ├── projects/
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── trpc/[trpc]/route.ts
│   │   ├── inngest/route.ts
│   │   └── sse/[projectId]/route.ts
│   ├── layout.tsx
│   └── page.tsx                        (landing page)
│
├── components/
│   ├── ui/                             (shadcn/ui components)
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── pipeline/
│   │   ├── StepTracker.tsx             (13-step vertical progress)
│   │   ├── SceneCard.tsx               (per-scene status card)
│   │   ├── CostMeter.tsx               (live cost counter)
│   │   └── ModelPlanTable.tsx          (pre-flight model selection display)
│   ├── editor/
│   │   ├── ScriptEditor.tsx
│   │   └── StoryboardEditor.tsx
│   ├── video/
│   │   └── VideoPlayer.tsx             (Video.js wrapper)
│   └── settings/
│       ├── ApiKeyManager.tsx
│       └── CapabilityMatrix.tsx
│
├── server/
│   ├── routers/
│   │   ├── project.ts                  (create, list, get, delete)
│   │   ├── scene.ts                    (update voiceover, update visual prompt)
│   │   ├── user.ts                     (profile, api keys)
│   │   └── pipeline.ts                 (start, cancel, get status)
│   └── trpc.ts
│
├── services/
│   ├── workflow.ts                     (Inngest pipeline orchestration)
│   ├── safety.ts                       (Step 1)
│   ├── analysis.ts                     (Step 2 — StyleDNA + self-validation + evidence)
│   ├── research.ts                     (Step 3 — Google Search grounding)
│   ├── scripting.ts                    (Steps 4, 5, 6)
│   ├── storyboard.ts                   (Step 7)
│   ├── production.ts                   (Steps 8, 9, 10)
│   ├── tts.ts                          (Step 11)
│   ├── videoRenderer.ts                (Step 12 — FFmpeg audio-driven alignment)
│   ├── refinement.ts                   (Step 13)
│   ├── planning.ts                     (scene count + duration calculation)
│   ├── modelRegistry.ts               (capability detection, model selection, preflight)
│   ├── observability.ts               (Langfuse tracing + cost aggregation)
│   └── adapters/
│       ├── geminiAdapter.ts
│       ├── openaiAdapter.ts
│       ├── anthropicAdapter.ts
│       ├── veoAdapter.ts
│       ├── klingAdapter.ts
│       ├── runwayAdapter.ts
│       └── ttsAdapter.ts              (unified TTS interface)
│
├── inngest/
│   ├── client.ts
│   └── functions/
│       ├── step1Safety.ts
│       ├── step2aCapabilityAssessment.ts  (2a: self-assessment, no video)
│       ├── step2bStyleDnaExtraction.ts    (2b: extraction with video, uses 2a output)
│       ├── step3Research.ts
│       ├── step4NarrativeMap.ts
│       ├── step5Script.ts
│       ├── step6QaAudit.ts
│       ├── step7Storyboard.ts
│       ├── step8ReferenceSheet.ts
│       ├── step9Keyframes.ts
│       ├── step10VideoGen.ts
│       ├── step11Tts.ts
│       ├── step12Render.ts
│       └── step13Refinement.ts
│
├── lib/
│   ├── utils.ts                        (PromisePool, formatDuration, hashFile)
│   ├── supabase.ts                     (client + server Supabase instances)
│   ├── gcs.ts                          (upload, download, getSignedUrl)
│   ├── encryption.ts                   (encrypt/decrypt API keys at rest)
│   ├── voiceMap.ts                     (language → TTS voice mapping)
│   └── types.ts                        (all shared TypeScript types — see below)
│
├── store/
│   └── projectStore.ts                 (Zustand — project state + SSE event handler)
│
├── middleware.ts                        (Supabase auth session + route protection)
├── i18n/
│   ├── en.json
│   └── zh.json
├── supabase/
│   └── migrations/
│       └── 001_initial.sql             (full schema from above)
├── .env.example
└── README.md
```

---

## Core TypeScript Types (implement fully in `lib/types.ts`)

```typescript
// All types must be fully defined — no `any`, no partial stubs

interface CapabilityField {
  fieldName: string;
  pipeline: 'script' | 'visual' | 'audio';
  confidence: 'confident' | 'inferred';
  reason: string;
  downstreamUsage: string;
}

interface CapabilityAssessment {
  scriptFields: CapabilityField[];
  visualFields: CapabilityField[];
  audioFields: CapabilityField[];
  blindSpots: string[];
  hasVoiceAudio: boolean | null;
  rawAssessmentText: string;       // preserve original plain-text response for debugging
}

interface StyleDNA {
  degraded: boolean;
  fallbackReason?: 'video_understanding_unavailable' | 'low_confidence' | null;
  capabilityAssessment: CapabilityAssessment;   // preserved from Step 2a
  scriptPipeline: {
    tone: string;
    vocabularyLevel: 'elementary' | 'intermediate' | 'expert';
    metaphorDensity: 'low' | 'medium' | 'high';
    sentenceRhythm: string;
    language: string;                           // BCP 47 tag e.g. 'zh-CN', 'en-US'
    openingHookPattern: string;
    closingHookPattern: string;
    wordsPerMinute: number;
    narrativeStructure: string[];               // ordered beat labels from reference video
  } | null;                                     // null if no voiceover detected
  visualPipeline: {
    colorGrading: string;
    lighting: string;
    cameraMotionPatterns: string[];
    compositionRules: string[];
    transitionTypes: string[];
    renderingStyle: string;
    palette: string[];                          // hex codes
    tier: Record<string, 'confident' | 'inferred'>;
  };
  audioPipeline: {
    musicStyle: string;                         // direct music gen prompt keyword
    musicMood: string;                          // direct music gen prompt keyword
    sfxStyle: string;
    voicePacing: number;                        // words per minute
    tier: Record<string, 'confident' | 'inferred'>;
  };
  evidence: Record<string, {
    timestamp: string;
    confidence: number;
    observation: string;
  }>;
}

// ── Narrative Map (Step 4 output) ─────────────────────────────────────────────

interface SceneStyleConstraints {
  sentencePattern: string;      // e.g. "rhetorical question → short answer"
  toneShift: string;            // e.g. "escalate urgency", "neutral → wonder"
  metaphorRequired: boolean;
  maxSentenceCount: number;
}

interface NarrativeMapScene {
  sceneIndex: number;
  beat: string;                 // maps to a beat in StyleDNA.scriptPipeline.narrativeStructure
  voiceoverDraft: string;       // one-sentence binding draft — Step 5 expands, never replaces
  factsBound: string[];         // fact IDs from ResearchReport.facts — must appear in this scene
  analogyBound: string | null;  // analogy ID from ResearchReport.analogies, or null
  styleConstraints: SceneStyleConstraints;
  estimatedDurationSec: number; // derived from voiceoverDraft length
}

interface NarrativeMap {
  scenes: NarrativeMapScene[];
  totalEstimatedDurationSec: number;
  durationTargetSec: number;
  durationWithinBounds: boolean;          // must be within ±5% of target
  allFactsAssigned: boolean;              // validation flag
  allMisconceptionsAddressed: boolean;    // validation flag
}

// ── Script (Step 5 output) ────────────────────────────────────────────────────

interface ScriptScene {
  sceneIndex: number;
  beat: string;
  voiceover: string;            // full expanded voiceover text for this scene
  wordCount: number;
  estimatedDurationSec: number; // recalculated from final voiceover length
  contractRef: NarrativeMapScene; // reference back to the production contract
}

interface Script {
  scenes: ScriptScene[];
  totalWordCount: number;
  totalEstimatedDurationSec: number;
  language: string;
}

// ── Other types (fully implement in lib/types.ts) ─────────────────────────────

interface ResearchReport {
  topic: string;
  facts: Array<{ id: string; text: string; source: string }>;
  misconceptions: Array<{ id: string; myth: string; correction: string }>;
  terms: Array<{ id: string; term: string; definition: string }>;
  analogies: Array<{ id: string; analogy: string; targetConcept: string }>;
}

interface StoryboardScene {
  sceneIndex: number;
  beat: string;
  voiceover: string;
  visualPrompt: string;
  cameraMotion: string;
  keyElements: string[];
  estimatedDurationSec: number;
  actualAudioDurationSec?: number;
  audioUrl?: string;
  keyframeUrl?: string;
  videoUrl?: string;
  renderedSceneUrl?: string;
  usedT2vFallback: boolean;
  status: 'pending' | 'generating_image' | 'generating_video' | 'generating_audio' | 'rendered' | 'failed';
}

interface Storyboard {
  scenes: StoryboardScene[];
  referenceSheetUrl?: string;
}

interface SafetyResult {
  isFlagged: boolean;
  reason: string;
  safeAlternative: string | null;
}

interface PipelineEvent {
  projectId: string;
  stepNumber: number;
  stepName: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  message?: string;
  costUsd?: number;
  modelUsed?: string;
  durationMs?: number;
}

interface ModelPlan {
  steps: Array<{
    step: PipelineStep;
    provider: string;
    model: string;
    estimatedCostUsd: number;
  }>;
  totalEstimatedCostUsd: number;
  missingCapabilities: Array<{
    step: PipelineStep;
    capability: string;
    suggestedProvider: string;
  }>;
}

type PipelineStep =
  | 'step_1_safety'
  | 'step_2a_capability_assessment'
  | 'step_2b_style_dna'
  | 'step_3_research'
  | 'step_4_narrative_map'
  | 'step_5_script'
  | 'step_6_qa_audit'
  | 'step_7_storyboard'
  | 'step_8_reference_sheet'
  | 'step_9_keyframes'
  | 'step_10_video_gen'
  | 'step_11_tts'
  | 'step_12_render'
  | 'step_13_refinement';
```

---

## Output Instructions

1. Output the **complete file tree** first, confirming the structure above
2. Implement **every file completely and in full** — zero placeholders, zero `// TODO` comments, zero `...rest of implementation` stubs
3. All TypeScript must pass strict mode — no `any`, no `@ts-ignore`
4. Every Inngest function must include: retry configuration, error boundaries, `emitPipelineEvent` calls at start and end
5. Every model call must be wrapped in try/catch with the fallback behavior specified per step
6. The `videoRenderer.ts` audio-driven alignment logic must match the code specified exactly
7. `README.md` must include: prerequisites, environment setup, Supabase migration commands, GCS bucket setup, Inngest dev server setup, local development commands, production deployment checklist

Begin now. Start with the complete file tree, then implement files in dependency order (types → lib → services/adapters → services → inngest → server → components → app).
