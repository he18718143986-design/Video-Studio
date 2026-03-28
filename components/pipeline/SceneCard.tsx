'use client';

import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AlertTriangle, ImageIcon, Film, Mic, CheckCircle } from 'lucide-react';

interface SceneCardProps {
  sceneIndex: number;
  beat: string;
  voiceover: string;
  visualPrompt: string;
  status: string;
  usedT2vFallback: boolean;
  keyframeUrl?: string | null;
  estimatedDuration: number;
  onClick?: () => void;
}

export function SceneCard({
  sceneIndex,
  beat,
  voiceover,
  visualPrompt,
  status,
  usedT2vFallback,
  keyframeUrl,
  estimatedDuration,
  onClick,
}: SceneCardProps) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; icon: React.ReactNode }> = {
    pending: { label: 'Pending', variant: 'secondary', icon: null },
    generating_image: { label: 'Gen Image', variant: 'default', icon: <ImageIcon className="h-3 w-3" /> },
    generating_video: { label: 'Gen Video', variant: 'default', icon: <Film className="h-3 w-3" /> },
    generating_audio: { label: 'Gen Audio', variant: 'default', icon: <Mic className="h-3 w-3" /> },
    rendered: { label: 'Done', variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
    failed: { label: 'Failed', variant: 'destructive', icon: null },
  };

  const config = statusConfig[status] ?? statusConfig['pending']!;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5',
        status === 'rendered' && 'border-green-500/30',
        status === 'failed' && 'border-red-500/30',
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">#{sceneIndex + 1}</span>
            <Badge variant="outline" className="text-xs">{beat}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {usedT2vFallback && (
              <Badge variant="warning" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                T2V
              </Badge>
            )}
            <Badge variant={config.variant} className="text-xs gap-1">
              {config.icon}
              {config.label}
            </Badge>
          </div>
        </div>

        {keyframeUrl && (
          <div className="relative aspect-video rounded-md overflow-hidden bg-muted">
            <Image
              src={keyframeUrl}
              alt={`Scene ${sceneIndex + 1} keyframe`}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        )}

        <p className="text-sm text-foreground line-clamp-2">{voiceover}</p>

        <p className="text-xs text-muted-foreground line-clamp-1" title={visualPrompt}>
          {visualPrompt}
        </p>

        <div className="text-xs text-muted-foreground">
          ~{estimatedDuration.toFixed(1)}s
        </div>
      </CardContent>
    </Card>
  );
}
