import { trackModelCall } from '@/services/observability';

export async function generateVideo(params: {
  model: string;
  prompt: string;
  imageBase64?: string;
  apiKey?: string;
}): Promise<{ videoUrl: string }> {
  const key = params.apiKey ?? process.env.KLING_API_KEY;
  if (!key) throw new Error('Kling API key not configured');

  const tracker = trackModelCall('kling', params.model, 'kling-video-gen', Date.now());

  const requestBody: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    mode: params.imageBase64 ? 'image-to-video' : 'text-to-video',
    duration: '5',
    aspect_ratio: '16:9',
  };

  if (params.imageBase64) {
    requestBody['image'] = params.imageBase64;
  }

  const createResponse = await fetch('https://api.klingai.com/v1/videos/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!createResponse.ok) {
    throw new Error(`Kling video creation failed: ${await createResponse.text()}`);
  }

  const createData = await createResponse.json() as { data?: { task_id: string } };
  const taskId = createData.data?.task_id;
  if (!taskId) throw new Error('No task ID from Kling');

  let videoUrl: string | undefined;
  for (let attempt = 0; attempt < 120; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const statusResponse = await fetch(`https://api.klingai.com/v1/videos/generate/${taskId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!statusResponse.ok) continue;

    const statusData = await statusResponse.json() as {
      data?: { status: string; output?: { video_url: string } };
    };

    if (statusData.data?.status === 'completed' && statusData.data.output?.video_url) {
      videoUrl = statusData.data.output.video_url;
      break;
    }

    if (statusData.data?.status === 'failed') {
      throw new Error('Kling video generation failed');
    }
  }

  tracker.end({ callCount: 1 });

  if (!videoUrl) throw new Error('Kling video generation timed out');
  return { videoUrl };
}
