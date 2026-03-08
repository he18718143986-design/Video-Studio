interface VoiceConfig {
  geminiVoice: string;
  elevenlabsVoiceId: string;
  openaiVoice: string;
  label: string;
}

const VOICE_MAP: Record<string, VoiceConfig> = {
  'zh-CN': {
    geminiVoice: 'Zephyr',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
    openaiVoice: 'nova',
    label: 'Chinese (Mandarin)',
  },
  'zh-TW': {
    geminiVoice: 'Zephyr',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
    openaiVoice: 'nova',
    label: 'Chinese (Traditional)',
  },
  'en-US': {
    geminiVoice: 'Kore',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
    openaiVoice: 'alloy',
    label: 'English (US)',
  },
  'en-GB': {
    geminiVoice: 'Kore',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
    openaiVoice: 'echo',
    label: 'English (UK)',
  },
  'ja-JP': {
    geminiVoice: 'Zephyr',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
    openaiVoice: 'shimmer',
    label: 'Japanese',
  },
  'ko-KR': {
    geminiVoice: 'Zephyr',
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? 'pNInz6obpgDQGcFmaJgB',
    openaiVoice: 'shimmer',
    label: 'Korean',
  },
};

const DEFAULT_VOICE: VoiceConfig = {
  geminiVoice: 'Kore',
  elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
  openaiVoice: 'alloy',
  label: 'Default',
};

export function getVoiceConfig(language: string): VoiceConfig {
  return VOICE_MAP[language] ?? VOICE_MAP[language.split('-')[0] ?? ''] ?? DEFAULT_VOICE;
}

export function detectLanguageFromText(text: string): string {
  const chineseRegex = /[\u4e00-\u9fff]/;
  const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff]/;
  const koreanRegex = /[\uac00-\ud7af]/;

  if (japaneseRegex.test(text)) return 'ja-JP';
  if (koreanRegex.test(text)) return 'ko-KR';
  if (chineseRegex.test(text)) return 'zh-CN';
  return 'en-US';
}

export function getSupportedLanguages(): Array<{ code: string; label: string }> {
  return Object.entries(VOICE_MAP).map(([code, config]) => ({
    code,
    label: config.label,
  }));
}
