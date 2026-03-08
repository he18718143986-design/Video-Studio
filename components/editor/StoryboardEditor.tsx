'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SceneCard } from '@/components/pipeline/SceneCard';
import { Wand2 } from 'lucide-react';

interface StoryboardEditorProps {
  scenes: Array<{
    sceneIndex: number;
    beat: string;
    voiceover: string;
    visualPrompt: string;
    cameraMotion: string;
    keyElements: string[];
    estimatedDurationSec: number;
    status: string;
    usedT2vFallback: boolean;
    keyframeUrl?: string | null;
  }>;
  onUpdateVisuals: (feedback: string) => void;
  isRefining: boolean;
}

export function StoryboardEditor({
  scenes,
  onUpdateVisuals,
  isRefining,
}: StoryboardEditorProps) {
  const [showRefine, setShowRefine] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selectedScene, setSelectedScene] = useState<number | null>(null);

  const selected = scenes.find((s) => s.sceneIndex === selectedScene);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Storyboard</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRefine(!showRefine)}
          disabled={isRefining}
        >
          <Wand2 className="h-4 w-4 mr-1" />
          Update Visuals
        </Button>
      </div>

      {showRefine && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <Textarea
              placeholder="Describe visual changes (e.g., 'Make colors warmer', 'Add more detail to background elements')..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onUpdateVisuals(feedback);
                  setFeedback('');
                  setShowRefine(false);
                }}
                disabled={!feedback.trim() || isRefining}
              >
                {isRefining ? 'Updating...' : 'Apply Changes'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowRefine(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.sceneIndex}
            sceneIndex={scene.sceneIndex}
            beat={scene.beat}
            voiceover={scene.voiceover}
            visualPrompt={scene.visualPrompt}
            status={scene.status}
            usedT2vFallback={scene.usedT2vFallback}
            keyframeUrl={scene.keyframeUrl}
            estimatedDuration={scene.estimatedDurationSec}
            onClick={() => setSelectedScene(
              selectedScene === scene.sceneIndex ? null : scene.sceneIndex
            )}
          />
        ))}
      </div>

      {selected && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Scene #{(selected.sceneIndex ?? 0) + 1}</Badge>
              <Badge variant="outline">{selected.beat}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Visual Prompt</p>
              <p className="text-sm">{selected.visualPrompt}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Camera Motion</p>
              <p className="text-sm">{selected.cameraMotion}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Key Elements</p>
              <div className="flex flex-wrap gap-1">
                {selected.keyElements.map((el, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{el}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
