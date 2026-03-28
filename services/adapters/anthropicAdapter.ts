import Anthropic from '@anthropic-ai/sdk';
import { trackModelCall } from '@/services/observability';

function getClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Anthropic API key not configured');
  return new Anthropic({ apiKey: key });
}

export async function generateText(params: {
  model: string;
  systemPrompt?: string;
  prompt: string;
  apiKey?: string;
  maxTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('anthropic', params.model, 'generateText', Date.now());

  const response = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    system: params.systemPrompt ?? '',
    messages: [{ role: 'user', content: params.prompt }],
  });

  const textContent = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  const text = textContent?.text ?? '';
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

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
  maxTokens?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('anthropic', params.model, 'generateTextWithImage', Date.now());

  const mediaType = (params.imageMimeType ?? 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

  const response = await client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 8192,
    system: params.systemPrompt ?? '',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: params.imageBase64,
            },
          },
          { type: 'text', text: params.prompt },
        ],
      },
    ],
  });

  const textContent = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  const text = textContent?.text ?? '';
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}
