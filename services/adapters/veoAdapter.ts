import { trackModelCall } from '@/services/observability';

export async function generateVideoFromImage(params: {
  model: string;
  prompt: string;
  imageBase64: string;
  apiKey?: string;
}): Promise<{ videoBase64: string }> {
  const key = params.apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured for Veo');

  const tracker = trackModelCall('google', params.model, 'veo-i2v', Date.now());

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: params.imageBase64,
              },
            },
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
    throw new Error(`Veo I2V generation failed: ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data: string };
          fileData?: { fileUri: string };
        }>;
      };
    }>;
  };

  tracker.end({ callCount: 1 });

  const videoPart = data.candidates?.[0]?.content?.parts?.[0];
  if (videoPart?.inlineData?.data) {
    return { videoBase64: videoPart.inlineData.data };
  }
  if (videoPart?.fileData?.fileUri) {
    const videoResponse = await fetch(videoPart.fileData.fileUri);
    const buffer = await videoResponse.arrayBuffer();
    return { videoBase64: Buffer.from(buffer).toString('base64') };
  }

  throw new Error('No video data in Veo response');
}

export async function generateVideoFromText(params: {
  model: string;
  prompt: string;
  apiKey?: string;
}): Promise<{ videoBase64: string }> {
  const key = params.apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('Google AI API key not configured for Veo');

  const tracker = trackModelCall('google', params.model, 'veo-t2v', Date.now());

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: params.prompt }],
        }],
        generationConfig: {
          responseMimeType: 'video/mp4',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Veo T2V generation failed: ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data: string };
          fileData?: { fileUri: string };
        }>;
      };
    }>;
  };

  tracker.end({ callCount: 1 });

  const videoPart = data.candidates?.[0]?.content?.parts?.[0];
  if (videoPart?.inlineData?.data) {
    return { videoBase64: videoPart.inlineData.data };
  }
  if (videoPart?.fileData?.fileUri) {
    const videoResponse = await fetch(videoPart.fileData.fileUri);
    const buffer = await videoResponse.arrayBuffer();
    return { videoBase64: Buffer.from(buffer).toString('base64') };
  }

  throw new Error('No video data in Veo T2V response');
}
