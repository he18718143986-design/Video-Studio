'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Wand2, Save, X } from 'lucide-react';

interface ScriptEditorProps {
  scenes: Array<{
    sceneIndex: number;
    beat: string;
    voiceover: string;
    estimatedDurationSec: number;
  }>;
  onSaveScene: (sceneIndex: number, voiceover: string) => void;
  onRefineAll: (feedback: string) => void;
  onRefineScene: (sceneIndex: number, feedback: string) => void;
  isRefining: boolean;
}

export function ScriptEditor({
  scenes,
  onSaveScene,
  onRefineAll,
  onRefineScene,
  isRefining,
}: ScriptEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [refineFeedback, setRefineFeedback] = useState('');
  const [showRefineAll, setShowRefineAll] = useState(false);
  const [refiningSceneIndex, setRefiningSceneIndex] = useState<number | null>(null);
  const [sceneFeedback, setSceneFeedback] = useState('');

  const startEditing = (index: number, text: string) => {
    setEditingIndex(index);
    setEditText(text);
  };

  const saveEdit = () => {
    if (editingIndex !== null) {
      onSaveScene(editingIndex, editText);
      setEditingIndex(null);
      setEditText('');
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditText('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Script</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRefineAll(!showRefineAll)}
          disabled={isRefining}
        >
          <Wand2 className="h-4 w-4 mr-1" />
          Refine All with AI
        </Button>
      </div>

      {showRefineAll && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <Textarea
              placeholder="Describe how you'd like to improve the script..."
              value={refineFeedback}
              onChange={(e) => setRefineFeedback(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  onRefineAll(refineFeedback);
                  setRefineFeedback('');
                  setShowRefineAll(false);
                }}
                disabled={!refineFeedback.trim() || isRefining}
              >
                {isRefining ? 'Refining...' : 'Apply'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowRefineAll(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {scenes.map((scene) => (
          <Card key={scene.sceneIndex} className="border-border/40">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">#{scene.sceneIndex + 1}</span>
                  <Badge variant="outline" className="text-xs">{scene.beat}</Badge>
                  <span className="text-xs text-muted-foreground">~{scene.estimatedDurationSec.toFixed(1)}s</span>
                </div>
                <div className="flex gap-1">
                  {editingIndex !== scene.sceneIndex && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEditing(scene.sceneIndex, scene.voiceover)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setRefiningSceneIndex(
                          refiningSceneIndex === scene.sceneIndex ? null : scene.sceneIndex
                        )}
                      >
                        <Wand2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {editingIndex === scene.sceneIndex ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveEdit}>
                      <Save className="h-3 w-3 mr-1" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground/90">{scene.voiceover}</p>
              )}

              {refiningSceneIndex === scene.sceneIndex && editingIndex !== scene.sceneIndex && (
                <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/20 space-y-2">
                  <Textarea
                    placeholder="How should this scene be improved?"
                    value={sceneFeedback}
                    onChange={(e) => setSceneFeedback(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        onRefineScene(scene.sceneIndex, sceneFeedback);
                        setSceneFeedback('');
                        setRefiningSceneIndex(null);
                      }}
                      disabled={!sceneFeedback.trim() || isRefining}
                    >
                      Refine
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRefiningSceneIndex(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
