'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  onDownload?: () => void;
}

export function VideoPlayer({ src, poster, onDownload }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.src = src;
    video.load();
  }, [src]);

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    const a = document.createElement('a');
    a.href = src;
    a.download = 'science-video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          poster={poster}
          preload="metadata"
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleDownload} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Download MP4
        </Button>
      </div>
    </div>
  );
}
