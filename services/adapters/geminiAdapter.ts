import { GoogleGenerativeAI, type GenerateContentRequest, type ModelParams, type Part } from '@google/generative-ai';
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
  const tracker = trackModelCall('google', params.model, 'generateImage', Date.now());
  const key = params.apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured');

  const prompt =
    params.referenceImagePath
      ? `${params.prompt}\nReference image path: ${params.referenceImagePath}`
      : params.prompt;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:predict?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Image generation failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };
  const prediction = data.predictions?.[0];

  tracker.end({ imageCount: 1 });

  if (prediction?.bytesBase64Encoded) {
    return {
      imageBase64: prediction.bytesBase64Encoded,
      mimeType: prediction.mimeType ?? 'image/png',
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
  void params;
  throw new Error('Use veoAdapter for video generation. generateVideo in geminiAdapter is deprecated.');
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

  const genModelParams = {
    model: params.model,
    tools: [buildSearchTool(params.model)],
  } as ModelParams;

  const genModel = client.getGenerativeModel(genModelParams);

  const result = await genModel.generateContent(params.prompt);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;

  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  tracker.end({ inputTokens, outputTokens });

  return { text, inputTokens, outputTokens };
}

function buildSearchTool(model: string): Record<string, unknown> {
  const lower = model.toLowerCase();
  if (lower.includes('1.5')) {
    return {
      googleSearchRetrieval: {
        dynamicRetrievalConfig: { mode: 'MODE_DYNAMIC' },
      },
    };
  }
  return { googleSearch: {} };
}
