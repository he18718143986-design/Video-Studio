import { GoogleGenerativeAI, type GenerateContentRequest, type Part } from '@google/generative-ai';
import { trackModelCall } from '@/services/observability';
import { readFileSync } from 'fs';

function getClient(apiKey?: string): GoogleGenerativeAI {
  const key = apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured');
  return new GoogleGenerativeAI(key);
}

export async function generateText(params: {
  model: string;
  systemPrompt?: string;
  prompt: string;
  apiKey?: string;
  thinkingBudget?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('google', params.model, 'generateText', Date.now());

  const genModel = client.getGenerativeModel({
    model: params.model,
    systemInstruction: params.systemPrompt,
  });

  const result = await genModel.generateContent(params.prompt);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}

export async function generateTextWithVideo(params: {
  model: string;
  systemPrompt?: string;
  prompt: string;
  videoPath?: string;
  videoUrl?: string;
  apiKey?: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('google', params.model, 'generateTextWithVideo', Date.now());

  const genModel = client.getGenerativeModel({
    model: params.model,
    systemInstruction: params.systemPrompt,
  });

  const parts: Part[] = [];

  if (params.videoPath) {
    const videoBuffer = readFileSync(params.videoPath);
    const base64 = videoBuffer.toString('base64');
    parts.push({
      inlineData: {
        mimeType: 'video/mp4',
        data: base64,
      },
    });
  } else if (params.videoUrl) {
    parts.push({
      fileData: {
        mimeType: 'video/mp4',
        fileUri: params.videoUrl,
      },
    });
  }

  parts.push({ text: params.prompt });

  const result = await genModel.generateContent(parts);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}

export async function generateImage(params: {
  model: string;
  prompt: string;
  referenceImagePath?: string;
  apiKey?: string;
}): Promise<{ imageBase64: string; mimeType: string }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('google', params.model, 'generateImage', Date.now());

  const genModel = client.getGenerativeModel({ model: params.model });
  const parts: Part[] = [];

  if (params.referenceImagePath) {
    const imgBuffer = readFileSync(params.referenceImagePath);
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: imgBuffer.toString('base64'),
      },
    });
  }

  parts.push({ text: params.prompt });

  const result = await genModel.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'image/png',
    },
  } as GenerateContentRequest);

  const response = result.response;
  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.[0];

  tracker.end({ imageCount: 1 });

  if (imagePart && 'inlineData' in imagePart && imagePart.inlineData) {
    return {
      imageBase64: imagePart.inlineData.data ?? '',
      mimeType: imagePart.inlineData.mimeType ?? 'image/png',
    };
  }

  throw new Error('No image generated in response');
}

export async function generateVideo(params: {
  model: string;
  prompt: string;
  imageBase64?: string;
  apiKey?: string;
}): Promise<{ videoUrl: string }> {
  const key = params.apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured');

  const tracker = trackModelCall('google', params.model, 'generateVideo', Date.now());

  const requestBody: Record<string, unknown> = {
    model: `models/${params.model}`,
    prompt: params.prompt,
  };

  if (params.imageBase64) {
    requestBody['image'] = {
      imageBytes: params.imageBase64,
      mimeType: 'image/png',
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            ...(params.imageBase64 ? [{
              inlineData: {
                mimeType: 'image/png',
                data: params.imageBase64,
              },
            }] : []),
            { text: params.prompt },
          ],
        }],
        generationConfig: {
          responseMimeType: 'video/mp4',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Video generation failed: ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data: string; mimeType: string };
          fileData?: { fileUri: string };
        }>;
      };
    }>;
  };

  tracker.end({ callCount: 1 });

  const videoPart = data.candidates?.[0]?.content?.parts?.[0];
  if (videoPart?.fileData?.fileUri) {
    return { videoUrl: videoPart.fileData.fileUri };
  }
  if (videoPart?.inlineData?.data) {
    return { videoUrl: `data:video/mp4;base64,${videoPart.inlineData.data}` };
  }

  throw new Error('No video generated in response');
}

export async function generateTTS(params: {
  model: string;
  text: string;
  voice: string;
  language: string;
  apiKey?: string;
}): Promise<{ audioBase64: string; durationSec: number }> {
  const key = params.apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured');

  const tracker = trackModelCall('google', params.model, 'generateTTS', Date.now());

  const client = getClient(params.apiKey);
  const genModel = client.getGenerativeModel({ model: params.model });

  const result = await genModel.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: params.text }],
    }],
    generationConfig: {
      responseMimeType: 'audio/mp3',
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: params.voice,
          },
        },
      },
    } as Record<string, unknown>,
  } as GenerateContentRequest);

  const response = result.response;
  const audioPart = response.candidates?.[0]?.content?.parts?.[0];

  tracker.end({ characterCount: params.text.length });

  if (audioPart && 'inlineData' in audioPart && audioPart.inlineData?.data) {
    const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
    const estimatedDuration = audioBuffer.length / (128 * 1000 / 8);
    return {
      audioBase64: audioPart.inlineData.data,
      durationSec: estimatedDuration,
    };
  }

  throw new Error('No audio generated in response');
}

export async function generateWithSearchGrounding(params: {
  model: string;
  prompt: string;
  apiKey?: string;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = getClient(params.apiKey);
  const tracker = trackModelCall('google', params.model, 'generateWithSearch', Date.now());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const genModel = client.getGenerativeModel({
    model: params.model,
    tools: [{ googleSearchRetrieval: {} }],
  } as any);

  const result = await genModel.generateContent(params.prompt);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}
