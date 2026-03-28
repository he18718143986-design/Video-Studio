'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Upload, ArrowLeft, ArrowRight, Loader2, Globe } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase';

const AUTH_TIMEOUT_MS = 20_000;
const PROJECT_INSERT_TIMEOUT_MS = 20_000;
const MIN_UPLOAD_TIMEOUT_MS = 2 * 60_000;
const MAX_UPLOAD_TIMEOUT_MS = 30 * 60_000;
const UPLOAD_TIMEOUT_PER_MB_MS = 10_000;
const DEFAULT_STORAGE_BUCKET = 'videos';
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET?.trim() || DEFAULT_STORAGE_BUCKET;
const EXTENSION_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

function withTimeout<T>(promise: PromiseLike<T>, label: string, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const operationPromise = Promise.resolve(promise);

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.floor(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function getUploadTimeoutMs(file: File): number {
  const estimated = Math.ceil(file.size / (1024 * 1024)) * UPLOAD_TIMEOUT_PER_MB_MS;
  return Math.min(MAX_UPLOAD_TIMEOUT_MS, Math.max(MIN_UPLOAD_TIMEOUT_MS, estimated));
}

function getUploadMimeType(file: File): string | null {
  const browserDetected = file.type?.trim().toLowerCase();
  if (browserDetected === 'video/mp4' || browserDetected === 'video/webm' || browserDetected === 'video/quicktime') {
    return browserDetected;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && EXTENSION_TO_MIME[extension]) {
    return EXTENSION_TO_MIME[extension];
  }

  return null;
}

function sanitizeFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  const extension = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : '';
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;

  const normalizedBase = baseName
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  const safeBase = normalizedBase.length > 0 ? normalizedBase.slice(0, 80) : 'upload';
  const safeExtension = extension.replace(/[^a-z0-9.]/g, '').slice(0, 10);

  return `${safeBase}${safeExtension}`;
}

export default function NewProjectPage() {
  const [step, setStep] = useState(1);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadMethod, setUploadMethod] = useState<'file' | 'url'>('url');
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('120');
  const [quality, setQuality] = useState<'fast' | 'high'>('fast');
  const [language, setLanguage] = useState('auto');
  const [creating, setCreating] = useState(false);
  const [creatingStage, setCreatingStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024 * 1024) {
        setError('File size exceeds 500MB limit');
        setVideoFile(null);
        return;
      }

      const mimeType = getUploadMimeType(file);
      if (!mimeType) {
        setError('Unsupported file type. Please upload MP4, MOV, or WebM.');
        setVideoFile(null);
        return;
      }

      setVideoFile(file);
      setError(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreatingStage('Checking account...');
    setError(null);

    try {
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        'Authentication check',
        AUTH_TIMEOUT_MS
      );
      if (!user) {
        setCreatingStage('');
        setCreating(false);
        router.push('/login');
        return;
      }

      let referenceVideoUrl = videoUrl || null;

      if (videoFile) {
        const uploadMimeType = getUploadMimeType(videoFile);
        if (!uploadMimeType) {
          setError('Unsupported file type. Please upload MP4, MOV, or WebM.');
          setCreatingStage('');
          setCreating(false);
          return;
        }

        setCreatingStage('Uploading reference video...');
        const safeFileName = sanitizeFileName(videoFile.name);
        const filePath = `uploads/${user.id}/${Date.now()}_${safeFileName}`;
        const { error: uploadError } = await withTimeout(
          supabase.storage
            .from(STORAGE_BUCKET)
            .upload(filePath, videoFile, {
              contentType: uploadMimeType,
              upsert: false,
            }),
          'Video upload',
          getUploadTimeoutMs(videoFile)
        );

        if (uploadError) {
          const lowerMessage = uploadError.message.toLowerCase();
          const storageHint = (
            lowerMessage.includes('bucket')
            || lowerMessage.includes('policy')
            || lowerMessage.includes('permission')
            || lowerMessage.includes('mime')
            || lowerMessage.includes('bad request')
          )
            ? ` Check Supabase Storage: bucket "${STORAGE_BUCKET}", mime types, and storage RLS policies.`
            : '';
          setError(`Upload failed: ${uploadError.message}.${storageHint}`);
          setCreatingStage('');
          setCreating(false);
          return;
        }

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        referenceVideoUrl = urlData.publicUrl;
      }

      const projectTitle = title || `${topic} Video`;

      setCreatingStage('Saving project...');
      const { data: project, error: insertError } = await withTimeout(
        supabase
          .from('projects')
          .insert({
            user_id: user.id,
            title: projectTitle,
            reference_video_url: referenceVideoUrl,
            new_topic: topic,
            target_duration_sec: parseInt(duration, 10),
            quality,
            language,
            status: 'pending',
            current_step: 0,
          })
          .select()
          .single(),
        'Project creation',
        PROJECT_INSERT_TIMEOUT_MS
      );

      if (insertError) {
        setError(insertError.message);
        setCreatingStage('');
        setCreating(false);
        return;
      }

      router.push(`/projects/${project.id}`);
      setCreatingStage('');
      setCreating(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('video upload timed out')) {
        setError(`Create project failed: ${message}. Upload may be slow on current network. Try a smaller video first (e.g. <50MB) or retry on a faster connection.`);
        setCreatingStage('');
        setCreating(false);
        return;
      }
      setError(`Create project failed: ${message}`);
      setCreatingStage('');
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background notranslate" translate="no">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">New Project</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s === step ? 'bg-primary text-primary-foreground' :
                s < step ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {s < step ? '✓' : s}
              </div>
              <span className={`text-sm ${s === step ? 'text-foreground' : 'text-muted-foreground'}`}>
                {s === 1 ? 'Reference' : s === 2 ? 'Topic' : 'Configure'}
              </span>
              {s < 3 && <div className={`flex-1 h-0.5 ${s < step ? 'bg-green-500' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/15 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Reference Video</CardTitle>
              <CardDescription>
                Upload a science animation video or paste a URL. This video&apos;s style will be used as reference.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4">
                <Button
                  variant={uploadMethod === 'url' ? 'default' : 'outline'}
                  onClick={() => setUploadMethod('url')}
                  className="flex-1"
                >
                  <Globe className="h-4 w-4 mr-2" /> Paste URL
                </Button>
                <Button
                  variant={uploadMethod === 'file' ? 'default' : 'outline'}
                  onClick={() => setUploadMethod('file')}
                  className="flex-1"
                >
                  <Upload className="h-4 w-4 mr-2" /> Upload File
                </Button>
              </div>

              {uploadMethod === 'url' ? (
                <div className="space-y-2">
                  <Label htmlFor="videoUrl">Video URL</Label>
                  <Input
                    id="videoUrl"
                    type="url"
                    placeholder="https://youtube.com/watch?v=... or direct video URL"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Supports YouTube URLs and direct video links</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="videoFile">Video File</Label>
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <input
                      id="videoFile"
                      type="file"
                      accept="video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <label htmlFor="videoFile" className="cursor-pointer space-y-2 block">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {videoFile ? videoFile.name : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-muted-foreground">Max 500MB. MP4, MOV, WebM supported.</p>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!videoUrl && !videoFile}>
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>New Topic</CardTitle>
              <CardDescription>
                What science topic should the new video cover?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  placeholder="e.g., How kidneys work, Quantum entanglement, Photosynthesis"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Project Title (optional)</Label>
                <Input
                  id="title"
                  placeholder="Leave empty to auto-generate from topic"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Additional Details (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Any specific aspects to focus on, target audience, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!topic.trim()}>
                  Next <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Configure</CardTitle>
              <CardDescription>
                Set video duration, quality, and language preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Target Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">1 minute (~8 scenes)</SelectItem>
                    <SelectItem value="120">2 minutes (~15 scenes)</SelectItem>
                    <SelectItem value="180">3 minutes (~23 scenes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quality</Label>
                <Select value={quality} onValueChange={(v) => setQuality(v as 'fast' | 'high')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fast">Fast (lower cost, Veo 3 Fast)</SelectItem>
                    <SelectItem value="high">High (higher quality, Veo 3)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect from reference</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                    <SelectItem value="zh-CN">Chinese (Mandarin)</SelectItem>
                    <SelectItem value="ja-JP">Japanese</SelectItem>
                    <SelectItem value="ko-KR">Korean</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" /> Create Project
                    </>
                  )}
                </Button>
              </div>
              {creating && creatingStage ? (
                <p className="text-xs text-muted-foreground">{creatingStage}</p>
              ) : null}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
