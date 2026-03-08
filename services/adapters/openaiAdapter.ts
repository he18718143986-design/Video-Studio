import OpenAI from 'openai';
import { trackModelCall } from '@/services/observability';

function getClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API key not configured');
  return new OpenAI({ apiKey: key });
}

export async function generateText(params: {
  model: string;
  systemPrompt?: string;
  prompt: string;
  apiKey?: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('openai', params.model, 'generateText', Date.now());

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  messages.push({ role: 'user', content: params.prompt });

  const response = await client.chat.completions.create({
    model: params.model,
    messages,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content ?? '';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}

export async function generateTextWithImage(params: {
  model: string;
  systemPrompt?: string;
  prompt: string;
  imageBase64: string;
  imageMimeType?: string;
  apiKey?: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('openai', params.model, 'generateTextWithImage', Date.now());

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }
  messages.push({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: {
          url: `data:${params.imageMimeType ?? 'image/png'};base64,${params.imageBase64}`,
        },
      },
      { type: 'text', text: params.prompt },
    ],
  });

  const response = await client.chat.completions.create({
    model: params.model,
    messages,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content ?? '';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}

export async function generateImage(params: {
  model: string;
  prompt: string;
  apiKey?: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
}): Promise<{ imageUrl: string }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('openai', params.model, 'generateImage', Date.now());

  const response = await client.images.generate({
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size ?? '1024x1024',
    quality: 'hd',
  });

  tracker.end({ imageCount: 1 });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in OpenAI response');

  return { imageUrl };
}

export async function generateTTS(params: {
  model: string;
  text: string;
  voice: string;
  apiKey?: string;
}): Promise<{ audioBuffer: Buffer }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('openai', params.model, 'generateTTS', Date.now());

  const response = await client.audio.speech.create({
    model: params.model,
    voice: params.voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    input: params.text,
    response_format: 'mp3',
  });

  tracker.end({ characterCount: params.text.length });

  const arrayBuffer = await response.arrayBuffer();
  return { audioBuffer: Buffer.from(arrayBuffer) };
}

export async function transcribeAudio(params: {
  audioPath: string;
  apiKey?: string;
}): Promise<{ text: string; language: string }> {
  const client = getClient(params.apiKey);
  const fs = await import('fs');

  const response = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file: fs.createReadStream(params.audioPath),
    response_format: 'verbose_json',
  });

  return {
    text: response.text,
    language: (response as unknown as { language: string }).language ?? 'en',
  };
}
