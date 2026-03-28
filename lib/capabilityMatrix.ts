import type { Capability, Provider } from '@/lib/types';

export const CAPABILITY_MATRIX: Record<Provider, Capability[]> = {
  google: ['video_understanding', 'image_understanding', 'text_reasoning', 'fast_reasoning', 'image_generation', 'video_generation', 'tts'],
  openai: ['image_understanding', 'text_reasoning', 'fast_reasoning', 'image_generation', 'tts'],
  anthropic: ['image_understanding', 'text_reasoning', 'fast_reasoning'],
  elevenlabs: ['tts'],
  stability: ['image_generation'],
  kling: ['video_generation'],
  runway: ['video_generation'],
};
