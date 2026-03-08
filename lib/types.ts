export type Provider = 'google' | 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'kling' | 'runway';

export type Capability =
  | 'video_understanding'
  | 'image_understanding'
  | 'text_reasoning'
  | 'fast_reasoning'
  | 'image_generation'
  | 'video_generation'
  | 'tts';

export type PipelineStep =
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

export type RefinementMode = 'full_script' | 'single_scene' | 'visual_prompts';

export type ProjectStatus =
  | 'pending'
  | 'step_1' | 'step_2' | 'step_3' | 'step_4' | 'step_5' | 'step_6'
  | 'step_7' | 'step_8' | 'step_9' | 'step_10' | 'step_11' | 'step_12'
  | 'complete' | 'failed';

export type SceneStatus =
  | 'pending'
  | 'generating_image'
  | 'generating_video'
  | 'generating_audio'
  | 'rendered'
  | 'failed';

export type VocabularyLevel = 'elementary' | 'intermediate' | 'expert';
export type MetaphorDensity = 'low' | 'medium' | 'high';
export type ConfidenceLevel = 'confident' | 'inferred';
export type QualitySetting = 'fast' | 'high';

export interface CapabilityField {
  fieldName: string;
  pipeline: 'script' | 'visual' | 'audio';
  confidence: ConfidenceLevel;
  reason: string;
  downstreamUsage: string;
}

export interface CapabilityAssessment {
  scriptFields: CapabilityField[];
  visualFields: CapabilityField[];
  audioFields: CapabilityField[];
  blindSpots: string[];
  hasVoiceAudio: boolean | null;
  rawAssessmentText: string;
}

export interface StyleDNAFieldEvidence {
  timestamp: string;
  confidence: number;
  observation: string;
}

export interface StyleDNA {
  degraded: boolean;
  fallbackReason?: 'video_understanding_unavailable' | 'low_confidence' | null;
  capabilityAssessment: CapabilityAssessment;
  scriptPipeline: {
    tone: string;
    vocabularyLevel: VocabularyLevel;
    metaphorDensity: MetaphorDensity;
    sentenceRhythm: string;
    language: string;
    openingHookPattern: string;
    closingHookPattern: string;
    wordsPerMinute: number;
    narrativeStructure: string[];
  } | null;
  visualPipeline: {
    colorGrading: string;
    lighting: string;
    cameraMotionPatterns: string[];
    compositionRules: string[];
    transitionTypes: string[];
    renderingStyle: string;
    palette: string[];
    tier: Record<string, ConfidenceLevel>;
  };
  audioPipeline: {
    musicStyle: string;
    musicMood: string;
    sfxStyle: string;
    voicePacing: number;
    tier: Record<string, ConfidenceLevel>;
  };
  evidence: Record<string, StyleDNAFieldEvidence>;
}

export interface SceneStyleConstraints {
  sentencePattern: string;
  toneShift: string;
  metaphorRequired: boolean;
  maxSentenceCount: number;
}

export interface NarrativeMapScene {
  sceneIndex: number;
  beat: string;
  voiceoverDraft: string;
  factsBound: string[];
  analogyBound: string | null;
  styleConstraints: SceneStyleConstraints;
  estimatedDurationSec: number;
}

export interface NarrativeMap {
  scenes: NarrativeMapScene[];
  totalEstimatedDurationSec: number;
  durationTargetSec: number;
  durationWithinBounds: boolean;
  allFactsAssigned: boolean;
  allMisconceptionsAddressed: boolean;
}

export interface ScriptScene {
  sceneIndex: number;
  beat: string;
  voiceover: string;
  wordCount: number;
  estimatedDurationSec: number;
  contractRef: NarrativeMapScene;
}

export interface Script {
  scenes: ScriptScene[];
  totalWordCount: number;
  totalEstimatedDurationSec: number;
  language: string;
}

export interface ResearchFact {
  id: string;
  text: string;
  source: string;
}

export interface ResearchMisconception {
  id: string;
  myth: string;
  correction: string;
}

export interface ResearchTerm {
  id: string;
  term: string;
  definition: string;
}

export interface ResearchAnalogy {
  id: string;
  analogy: string;
  targetConcept: string;
}

export interface ResearchReport {
  topic: string;
  facts: ResearchFact[];
  misconceptions: ResearchMisconception[];
  terms: ResearchTerm[];
  analogies: ResearchAnalogy[];
}

export interface StoryboardScene {
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
  status: SceneStatus;
}

export interface Storyboard {
  scenes: StoryboardScene[];
  referenceSheetUrl?: string;
}

export interface SafetyResult {
  isFlagged: boolean;
  reason: string;
  safeAlternative: string | null;
}

export interface QAResult {
  qualityPass: boolean;
  safetyPass: boolean;
  issues: string[];
  revisedScript: Script | null;
}

export interface PipelineEvent {
  projectId: string;
  stepNumber: number;
  stepName: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  message?: string;
  costUsd?: number;
  modelUsed?: string;
  durationMs?: number;
}

export interface ModelPlanStep {
  step: PipelineStep;
  provider: string;
  model: string;
  estimatedCostUsd: number;
}

export interface MissingCapability {
  step: PipelineStep;
  capability: string;
  suggestedProvider: string;
}

export interface ModelPlan {
  steps: ModelPlanStep[];
  totalEstimatedCostUsd: number;
  missingCapabilities: MissingCapability[];
}

export interface StepRequirement {
  capability: Capability;
  preferred?: Provider;
}

export interface CostEntry {
  inputPer1kTokens?: number;
  outputPer1kTokens?: number;
  perImage?: number;
  perCall?: number;
  perCharacter?: number;
}

export interface ModelCallResult {
  provider: Provider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
  latencyMs: number;
  output: unknown;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  referenceVideoUrl: string | null;
  newTopic: string;
  targetDurationSec: number;
  quality: QualitySetting;
  language: string;
  status: ProjectStatus;
  currentStep: number;
  styleDna: StyleDNA | null;
  capabilityAssessment: CapabilityAssessment | null;
  researchReport: ResearchReport | null;
  narrativeMap: NarrativeMap | null;
  script: Script | null;
  storyboard: Storyboard | null;
  referenceSheetUrl: string | null;
  finalVideoUrl: string | null;
  totalCostUsd: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  projectId: string;
  sceneIndex: number;
  beat: string | null;
  voiceoverText: string | null;
  visualPrompt: string | null;
  cameraMotion: string | null;
  keyElements: string[];
  estimatedDurationSec: number | null;
  actualAudioDurationSec: number | null;
  audioUrl: string | null;
  keyframeUrl: string | null;
  videoUrl: string | null;
  renderedSceneUrl: string | null;
  usedT2vFallback: boolean;
  status: SceneStatus;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  createdAt: string;
}

export interface UserApiKey {
  id: string;
  userId: string;
  provider: Provider;
  encryptedKey: string;
  createdAt: string;
}

export interface RawStyleDNAField {
  value: unknown;
  confidence: ConfidenceLevel;
  score?: number;
  evidence?: string;
}

export interface RawStyleDNAResponse {
  scriptPipeline: Record<string, RawStyleDNAField> | null;
  visualPipeline: Record<string, RawStyleDNAField>;
  audioPipeline: Record<string, RawStyleDNAField>;
}

export class ModelUnavailableError extends Error {
  step: PipelineStep;
  capability: Capability;

  constructor(step: PipelineStep, capability: Capability) {
    super(`No provider available for step "${step}" requiring capability "${capability}"`);
    this.name = 'ModelUnavailableError';
    this.step = step;
    this.capability = capability;
  }
}

export class PipelineError extends Error {
  stepNumber: number;
  stepName: string;

  constructor(stepNumber: number, stepName: string, message: string) {
    super(message);
    this.name = 'PipelineError';
    this.stepNumber = stepNumber;
    this.stepName = stepName;
  }
}
