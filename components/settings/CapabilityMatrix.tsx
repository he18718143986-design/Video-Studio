'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { Provider, Capability } from '@/lib/types';
import { CAPABILITY_MATRIX } from '@/services/modelRegistry';

interface CapabilityMatrixProps {
  availableProviders: Record<Provider, boolean>;
}

const CAPABILITIES: Array<{ key: Capability; label: string }> = [
  { key: 'video_understanding', label: 'Video Understanding' },
  { key: 'image_understanding', label: 'Image Understanding' },
  { key: 'text_reasoning', label: 'Text Reasoning' },
  { key: 'fast_reasoning', label: 'Fast Reasoning' },
  { key: 'image_generation', label: 'Image Generation' },
  { key: 'video_generation', label: 'Video Generation' },
  { key: 'tts', label: 'TTS' },
];

const PROVIDERS: Array<{ key: Provider; label: string }> = [
  { key: 'google', label: 'Google' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'elevenlabs', label: 'ElevenLabs' },
  { key: 'stability', label: 'Stability' },
  { key: 'kling', label: 'Kling' },
  { key: 'runway', label: 'Runway' },
];

export function CapabilityMatrix({ availableProviders }: CapabilityMatrixProps) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-3 font-medium">Capability</th>
            {PROVIDERS.map((p) => (
              <th key={p.key} className="text-center p-3 font-medium">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs">{p.label}</span>
                  {availableProviders[p.key] ? (
                    <Badge variant="success" className="text-[10px] px-1.5 py-0">Active</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Off</Badge>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((cap) => (
            <tr key={cap.key} className="border-b last:border-b-0">
              <td className="p-3 text-xs font-medium">{cap.label}</td>
              {PROVIDERS.map((p) => {
                const hasCapability = CAPABILITY_MATRIX[p.key]?.includes(cap.key);
                const isActive = availableProviders[p.key] && hasCapability;

                return (
                  <td key={p.key} className="p-3 text-center">
                    {hasCapability ? (
                      isActive ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground/30 inline" />
                      )
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground/20 inline" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
