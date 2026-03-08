import { getVoiceConfig } from '@/lib/voiceMap';
import * as geminiAdapter from './geminiAdapter';
import * as openaiAdapter from './openaiAdapter';
import type { Provider } from '@/lib/types';

interface TTSResult {
  audioBuffer: Buffer;
  durationSec: number;
}

export async function synthesizeSpeech(params: {
  text: string;
  language: string;
  provider: Provider;
  model: string;
  apiKey?: string;
}): Promise<TTSResult> {
  const voiceConfig = getVoiceConfig(params.language);

  switch (params.provider) {
    case 'google':
      return synthesizeWithGemini({
        text: params.text,
        voice: voiceConfig.geminiVoice,
        language: params.language,
        model: params.model,
        apiKey: params.apiKey,
      });

    case 'elevenlabs':
      return synthesizeWithElevenLabs({
        text: params.text,
        voiceId: voiceConfig.elevenlabsVoiceId,
        apiKey: params.apiKey,
      });

    case 'openai':
      return synthesizeWithOpenAI({
        text: params.text,
        voice: voiceConfig.openaiVoice,
        model: params.model,
        apiKey: params.apiKey,
      });

    default:
      throw new Error(`Unsupported TTS provider: ${params.provider}`);
  }
}

async function synthesizeWithGemini(params: {
  text: string;
  voice: string;
  language: string;
  model: string;
  apiKey?: string;
}): Promise<TTSResult> {
  const result = await geminiAdapter.generateTTS({
    model: params.model,
    text: params.text,
    voice: params.voice,
    language: params.language,
    apiKey: params.apiKey,
  });

  return {
    audioBuffer: Buffer.from(result.audioBase64, 'base64'),
    durationSec: result.durationSec,
  };
}

async function synthesizeWithElevenLabs(params: {
  text: string;
  voiceId: string;
  apiKey?: string;
}): Promise<TTSResult> {
  const key = params.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ElevenLabs API key not configured');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
      },
      body: JSON.stringify({
        text: params.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS failed: ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  const estimatedDuration = audioBuffer.length / (128 * 1000 / 8);

  return { audioBuffer, durationSec: estimatedDuration };
}

async function synthesizeWithOpenAI(params: {
  text: string;
  voice: string;
  model: string;
  apiKey?: string;
}): Promise<TTSResult> {
  const result = await openaiAdapter.generateTTS({
    model: params.model,
    text: params.text,
    voice: params.voice,
    apiKey: params.apiKey,
  });

  const estimatedDuration = result.audioBuffer.length / (128 * 1000 / 8);
  return { audioBuffer: result.audioBuffer, durationSec: estimatedDuration };
}
