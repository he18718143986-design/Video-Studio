'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Trash2, Check, Loader2 } from 'lucide-react';
import type { Provider } from '@/lib/types';

interface ApiKeyEntry {
  provider: Provider;
  maskedKey: string;
  createdAt: string;
}

interface ApiKeyManagerProps {
  existingKeys: ApiKeyEntry[];
  onSaveKey: (
    provider: Provider,
    apiKey: string
  ) => Promise<{ valid: boolean; message: string; verified?: boolean }>;
  onDeleteKey: (provider: Provider) => Promise<void>;
}

const PROVIDERS: Array<{ value: Provider; label: string; description: string }> = [
  { value: 'google', label: 'Google AI', description: 'Gemini, Veo, TTS — core provider' },
  { value: 'openai', label: 'OpenAI', description: 'GPT-4o, DALL-E, Whisper' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude Opus, Haiku' },
  { value: 'elevenlabs', label: 'ElevenLabs', description: 'Premium TTS voices' },
  { value: 'stability', label: 'Stability AI', description: 'Stable Diffusion' },
  { value: 'kling', label: 'Kling', description: 'Video generation' },
  { value: 'runway', label: 'Runway', description: 'Gen-3 video generation' },
];

export function ApiKeyManager({ existingKeys, onSaveKey, onDeleteKey }: ApiKeyManagerProps) {
  const [newKeys, setNewKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, { valid: boolean; message: string; verified?: boolean }>
  >({});

  const handleSave = async (provider: Provider) => {
    const key = newKeys[provider];
    if (!key) return;

    setTesting(provider);
    const result = await onSaveKey(provider, key);
    setTestResult((prev) => ({ ...prev, [provider]: result }));
    setTesting(null);

    if (result.valid) {
      setNewKeys((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      {PROVIDERS.map(({ value: provider, label, description }) => {
        const existing = existingKeys.find((k) => k.provider === provider);
        const result = testResult[provider];

        return (
          <Card key={provider} className="border-border/40">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                {existing && (
                  <Badge variant="success" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {existing && (
                <div className="flex items-center gap-2">
                  <Input
                    value={existing.maskedKey}
                    disabled
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => onDeleteKey(provider)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKeys[provider] ? 'text' : 'password'}
                    placeholder={existing ? 'Enter new key to replace...' : 'Paste API key...'}
                    value={newKeys[provider] ?? ''}
                    onChange={(e) => setNewKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                    className="pr-10 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full w-10"
                    onClick={() => setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }))}
                  >
                    {showKeys[provider] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSave(provider)}
                  disabled={!newKeys[provider] || testing === provider}
                >
                  {testing === provider ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Save & Test'
                  )}
                </Button>
              </div>

              {result && (
                <p
                  className={`text-xs ${
                    result.valid
                      ? result.verified === false
                        ? 'text-yellow-400'
                        : 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {result.message}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
