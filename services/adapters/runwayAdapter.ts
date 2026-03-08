import { trackModelCall } from '@/services/observability';

export async function generateVideo(params: {
  model: string;
  prompt: string;
  imageUrl?: string;
  apiKey?: string;
}): Promise<{ videoUrl: string }> {
  const key = params.apiKey ?? process.env.RUNWAY_API_KEY;
  if (!key) throw new Error('Runway API key not configured');

  const tracker = trackModelCall('runway', params.model, 'runway-video-gen', Date.now());

  const requestBody: Record<string, unknown> = {
    model: params.model,
    promptText: params.prompt,
    watermark: false,
    duration: 5,
  };

  if (params.imageUrl) {
    requestBody['promptImage'] = params.imageUrl;
  }

  const createResponse = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(requestBody),
  });

  if (!createResponse.ok) {
    throw new Error(`Runway video creation failed: ${await createResponse.text()}`);
  }

  const createData = await createResponse.json() as { id: string };
  const taskId = createData.id;

  let videoUrl: string | undefined;
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!statusResponse.ok) continue;

    const statusData = await statusResponse.json() as {
      status: string;
      output?: string[];
    };

    if (statusData.status === 'SUCCEEDED' && statusData.output?.[0]) {
      videoUrl = statusData.output[0];
      break;
    }

    if (statusData.status === 'FAILED') {
      throw new Error('Runway video generation failed');
    }
  }

  tracker.end({ callCount: 1 });

  if (!videoUrl) throw new Error('Runway video generation timed out');
  return { videoUrl };
}
