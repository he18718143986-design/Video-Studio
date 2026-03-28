import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { uploadFile, downloadFile } from '@/lib/gcs';
import type { StoryboardScene } from '@/lib/types';

const TEMP_DIR = '/tmp/video-render';

async function ensureTempDir(): Promise<void> {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

async function downloadAsset(url: string, localPath: string): Promise<void> {
  if (url.startsWith('gs://')) {
    await downloadFile(url, localPath);
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
  } else if (url.startsWith('data:')) {
    const base64Data = url.split(',')[1];
    if (base64Data) {
      await fs.writeFile(localPath, Buffer.from(base64Data, 'base64'));
    }
  }
}

function ffmpegMergeVideoAudio(
  videoPath: string,
  audioPath: string | undefined,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(videoPath)
      .inputOptions([`-t ${duration}`]);

    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        ...(audioPath ? ['-c:a aac', '-b:a 128k'] : ['-an']),
        '-movflags +faststart',
        `-t ${duration}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function ffmpegLoopVideo(
  videoPath: string,
  audioPath: string | undefined,
  duration: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg()
      .input(videoPath)
      .inputOptions(['-stream_loop -1', `-t ${duration}`]);

    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        ...(audioPath ? ['-c:a aac', '-b:a 128k', '-shortest'] : ['-an']),
        '-movflags +faststart',
        `-t ${duration}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function ffmpegImageToVideo(
  imagePath: string,
  audioPath: string | undefined,
  duration: number,
  effect: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let zoomFilter: string;
    switch (effect) {
      case 'zoom-in':
        zoomFilter = `zoompan=z='min(zoom+0.001,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
        break;
      case 'zoom-out':
        zoomFilter = `zoompan=z='if(lte(zoom,1.0),1.3,max(1.001,zoom-0.001))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
        break;
      default:
        zoomFilter = `zoompan=z='min(zoom+0.001,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.ceil(duration * 25)}:s=1920x1080:fps=25`;
    }

    let cmd = ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1']);

    if (audioPath) {
      cmd = cmd.input(audioPath);
    }

    cmd
      .outputOptions([
        '-vf', zoomFilter,
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-pix_fmt yuv420p',
        ...(audioPath ? ['-c:a aac', '-b:a 128k', '-shortest'] : ['-an']),
        '-movflags +faststart',
        `-t ${duration}`,
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function ffmpegConcatenate(
  videoPaths: string[],
  outputPath: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const listPath = path.join(TEMP_DIR, 'concat_list.txt');
    const listContent = videoPaths.map((p) => `file '${p}'`).join('\n');
    await fs.writeFile(listPath, listContent);

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

function ffmpegBurnSubtitles(
  videoPath: string,
  subtitlePath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .outputOptions([
        '-vf', `subtitles='${subtitlePath}':force_style='FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=3,Outline=2,Shadow=1,MarginV=40'`,
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a copy',
        '-movflags +faststart',
        '-y',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

async function generateSRTSubtitles(
  scenes: StoryboardScene[]
): Promise<string> {
  let srtContent = '';
  let cumulativeTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const duration = scene.actualAudioDurationSec ?? scene.estimatedDurationSec;
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;

    srtContent += `${i + 1}\n`;
    srtContent += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
    srtContent += `${scene.voiceover}\n\n`;

    cumulativeTime = endTime;
  }

  return srtContent;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function renderScene(
  scene: StoryboardScene,
  index: number
): Promise<string> {
  await ensureTempDir();

  let duration = scene.estimatedDurationSec ?? 5;

  let audioPath: string | undefined;
  if (scene.audioUrl) {
    audioPath = path.join(TEMP_DIR, `audio_${index}.mp3`);
    await downloadAsset(scene.audioUrl, audioPath);
    try {
      const audioDuration = await getMediaDuration(audioPath);
      duration = audioDuration;
    } catch {
      // Use estimated duration
    }
  }

  duration = Math.max(duration, 2);
  const outputPath = path.join(TEMP_DIR, `scene_${index}.mp4`);

  if (scene.videoUrl) {
    const videoPath = path.join(TEMP_DIR, `video_${index}.mp4`);
    await downloadAsset(scene.videoUrl, videoPath);

    try {
      const videoDuration = await getMediaDuration(videoPath);
      if (videoDuration < duration) {
        await ffmpegLoopVideo(videoPath, audioPath, duration, outputPath);
      } else {
        await ffmpegMergeVideoAudio(videoPath, audioPath, duration, outputPath);
      }
    } catch {
      if (scene.keyframeUrl) {
        const imagePath = path.join(TEMP_DIR, `keyframe_${index}.png`);
        await downloadAsset(scene.keyframeUrl, imagePath);
        await ffmpegImageToVideo(imagePath, audioPath, duration, 'zoom-in', outputPath);
      } else {
        throw new Error(`Scene ${index} has no usable video or image asset`);
      }
    }

    return outputPath;
  }

  if (scene.keyframeUrl) {
    const imagePath = path.join(TEMP_DIR, `keyframe_${index}.png`);
    await downloadAsset(scene.keyframeUrl, imagePath);
    await ffmpegImageToVideo(imagePath, audioPath, duration, 'zoom-in', outputPath);
    return outputPath;
  }

  throw new Error(`Scene ${index} has no video or image asset`);
}

export async function renderFinalVideo(
  scenes: StoryboardScene[],
  projectId: string
): Promise<string> {
  await ensureTempDir();

  const sceneVideos: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    const scenePath = await renderScene(scene, i);
    sceneVideos.push(scenePath);
  }

  const concatenatedPath = path.join(TEMP_DIR, `${projectId}_concatenated.mp4`);
  await ffmpegConcatenate(sceneVideos, concatenatedPath);

  const srtContent = await generateSRTSubtitles(scenes);
  const srtPath = path.join(TEMP_DIR, `${projectId}_subtitles.srt`);
  await fs.writeFile(srtPath, srtContent);

  const finalPath = path.join(TEMP_DIR, `${projectId}_final.mp4`);

  try {
    await ffmpegBurnSubtitles(concatenatedPath, srtPath, finalPath);
  } catch {
    await fs.copyFile(concatenatedPath, finalPath);
  }

  const gcsPath = `projects/${projectId}/final_video.mp4`;
  const finalVideoUrl = await uploadFile(finalPath, gcsPath);

  try {
    for (const videoPath of sceneVideos) {
      await fs.unlink(videoPath).catch(() => {});
    }
    await fs.unlink(concatenatedPath).catch(() => {});
    await fs.unlink(srtPath).catch(() => {});
    await fs.unlink(finalPath).catch(() => {});
  } catch {
    // Cleanup is best-effort
  }

  return finalVideoUrl;
}
