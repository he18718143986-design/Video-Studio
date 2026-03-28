import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import { createServiceRoleClient } from '@/lib/supabase';

const bucketName = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'videos';

type StorageLocator = {
  bucket: string;
  objectPath: string;
};

function resolveStorageLocator(locatorOrPath: string): StorageLocator {
  const value = locatorOrPath.trim();
  if (!value) {
    throw new Error('Storage path is required');
  }

  if (value.startsWith('gs://') || value.startsWith('supabase://')) {
    const stripped = value.replace(/^gs:\/\//, '').replace(/^supabase:\/\//, '');
    const firstSlash = stripped.indexOf('/');
    if (firstSlash < 0) {
      throw new Error(`Invalid storage locator: ${locatorOrPath}`);
    }
    const explicitBucket = stripped.slice(0, firstSlash).trim();
    const objectPath = stripped.slice(firstSlash + 1).trim();
    if (!explicitBucket || !objectPath) {
      throw new Error(`Invalid storage locator: ${locatorOrPath}`);
    }
    return { bucket: explicitBucket, objectPath };
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Unsupported storage URL: ${locatorOrPath}`);
    }
    const parsedBucket = match[1];
    const parsedPath = match[2];
    if (!parsedBucket || !parsedPath) {
      throw new Error(`Unsupported storage URL: ${locatorOrPath}`);
    }
    return {
      bucket: decodeURIComponent(parsedBucket),
      objectPath: decodeURIComponent(parsedPath),
    };
  }

  return {
    bucket: bucketName,
    objectPath: value.replace(/^\/+/, ''),
  };
}

function inferContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
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
  return contentTypeMap[ext] ?? 'application/octet-stream';
}

export async function uploadBuffer(
  buffer: Buffer,
  destination: string,
  contentType: string
): Promise<string> {
  const storage = createServiceRoleClient();
  const { objectPath } = resolveStorageLocator(destination);

  const { error } = await storage
    .storage
    .from(bucketName)
    .upload(objectPath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = storage.storage.from(bucketName).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function uploadFile(
  localPath: string,
  destination: string
): Promise<string> {
  const buffer = readFileSync(localPath);
  const contentType = inferContentType(localPath);
  return uploadBuffer(buffer, destination, contentType);
}

export async function downloadFile(
  locatorOrUrl: string,
  localPath: string
): Promise<void> {
  if (locatorOrUrl.startsWith('http://') || locatorOrUrl.startsWith('https://')) {
    const response = await fetch(locatorOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch storage URL: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(localPath, buffer);
    return;
  }

  const storage = createServiceRoleClient();
  const { bucket, objectPath } = resolveStorageLocator(locatorOrUrl);
  const { data, error } = await storage.storage.from(bucket).download(objectPath);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? 'empty response'}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, buffer);
}

export async function getSignedUrl(
  locatorOrPath: string,
  expiresInMinutes = 60
): Promise<string> {
  const storage = createServiceRoleClient();
  const { bucket, objectPath } = resolveStorageLocator(locatorOrPath);
  const expiresIn = Math.max(1, Math.floor(expiresInMinutes * 60));

  const { data, error } = await storage.storage.from(bucket).createSignedUrl(objectPath, expiresIn);
  if (error || !data) {
    throw new Error(`Storage signed URL failed: ${error?.message ?? 'empty response'}`);
  }

  return data.signedUrl;
}

export async function deleteFile(locatorOrUrl: string): Promise<void> {
  const storage = createServiceRoleClient();
  const { bucket, objectPath } = resolveStorageLocator(locatorOrUrl);
  const { error } = await storage.storage.from(bucket).remove([objectPath]);
  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

export function getPublicUrl(destination: string): string {
  const storage = createServiceRoleClient();
  const { objectPath } = resolveStorageLocator(destination);
  const { data } = storage.storage.from(bucketName).getPublicUrl(objectPath);
  return data.publicUrl;
}
