import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export class PromisePool {
  private queue: Array<{ fn: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private active = 0;

  constructor(private readonly concurrency: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.active++;
      item
        .fn()
        .then((result) => {
          this.active--;
          item.resolve(result);
          this.processQueue();
        })
        .catch((error) => {
          this.active--;
          item.reject(error);
          this.processQueue();
        });
    }
  }
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}


export function estimateDuration(text: string, language: string): number {
  if (language.startsWith('zh')) {
    return text.length * 0.3;
  }
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount / 2.5;
}

export function countWords(text: string, language: string): number {
  if (language.startsWith('zh')) {
    return text.replace(/\s/g, '').length;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export const PIPELINE_STEP_NAMES: Record<string, string> = {
  step_1_safety: 'Safety Pre-check',
  step_2a_capability_assessment: 'Capability Self-Assessment',
  step_2b_style_dna: 'Style DNA Extraction',
  step_3_research: 'Deep Research',
  step_4_narrative_map: 'Narrative Map Generation',
  step_5_script: 'Script Draft Generation',
  step_6_qa_audit: 'QA Audit & Safety Re-check',
  step_7_storyboard: 'Storyboard Generation',
  step_8_reference_sheet: 'Style Reference Sheet',
  step_9_keyframes: 'Scene Keyframe Generation',
  step_10_video_gen: 'Scene Video Generation',
  step_11_tts: 'TTS Voice Generation',
  step_12_render: 'Video Rendering',
  step_13_refinement: 'Refinement',
};

export function stepNumberFromName(stepName: string): number {
  const map: Record<string, number> = {
    step_1_safety: 1,
    step_2a_capability_assessment: 2,
    step_2b_style_dna: 2,
    step_3_research: 3,
    step_4_narrative_map: 4,
    step_5_script: 5,
    step_6_qa_audit: 6,
    step_7_storyboard: 7,
    step_8_reference_sheet: 8,
    step_9_keyframes: 9,
    step_10_video_gen: 10,
    step_11_tts: 11,
    step_12_render: 12,
    step_13_refinement: 13,
  };
  return map[stepName] ?? 0;
}
