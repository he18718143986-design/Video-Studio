import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'fs';
import path from 'path';

const bucketName = process.env.GCS_BUCKET_NAME ?? 'ai-science-videos';
const projectId = process.env.GCS_PROJECT_ID;

let storage: Storage;

function getStorage(): Storage {
  if (!storage) {
    const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentials && credentials.endsWith('.json')) {
      storage = new Storage({ projectId, keyFilename: credentials });
    } else if (credentials) {
      try {
        const parsed = JSON.parse(credentials) as Record<string, unknown>;
        storage = new Storage({ projectId, credentials: parsed });
      } catch {
        storage = new Storage({ projectId });
      }
    } else {
      storage = new Storage({ projectId });
    }
  }
  return storage;
}

export async function uploadBuffer(
  buffer: Buffer,
  destination: string,
  contentType: string
): Promise<string> {
  const bucket = getStorage().bucket(bucketName);
  const file = bucket.file(destination);
  await file.save(buffer, { contentType, resumable: false });
  return `gs://${bucketName}/${destination}`;
}

export async function uploadFile(
  localPath: string,
  destination: string
): Promise<string> {
  const buffer = readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.json': 'application/json',
  };
  const contentType = contentTypeMap[ext] ?? 'application/octet-stream';
  return uploadBuffer(buffer, destination, contentType);
}

export async function downloadFile(
  gcsUrl: string,
  localPath: string
): Promise<void> {
  const filePath = gcsUrl.replace(`gs://${bucketName}/`, '');
  const bucket = getStorage().bucket(bucketName);
  await bucket.file(filePath).download({ destination: localPath });
}

export async function getSignedUrl(
  gcsPath: string,
  expiresInMinutes = 60
): Promise<string> {
  const filePath = gcsPath.replace(`gs://${bucketName}/`, '');
  const bucket = getStorage().bucket(bucketName);
  const [url] = await bucket.file(filePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });
  return url;
}

export async function deleteFile(gcsUrl: string): Promise<void> {
  const filePath = gcsUrl.replace(`gs://${bucketName}/`, '');
  const bucket = getStorage().bucket(bucketName);
  await bucket.file(filePath).delete({ ignoreNotFound: true });
}

export function getPublicUrl(destination: string): string {
  return `https://storage.googleapis.com/${bucketName}/${destination}`;
}
