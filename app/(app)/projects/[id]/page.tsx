'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StepTracker } from '@/components/pipeline/StepTracker';
import { CostMeter } from '@/components/pipeline/CostMeter';
import { SceneCard } from '@/components/pipeline/SceneCard';
import { ScriptEditor } from '@/components/editor/ScriptEditor';
import { StoryboardEditor } from '@/components/editor/StoryboardEditor';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { useProjectStore } from '@/store/projectStore';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { ArrowLeft, Play, Sparkles, RotateCcw, AlertTriangle } from 'lucide-react';

interface ProjectData {
  id: string;
  title: string;
  new_topic: string;
  status: string;
  current_step: number;
  total_cost_usd: number;
  quality: string;
  target_duration_sec: number;
  script: { scenes: Array<{ sceneIndex: number; beat: string; voiceover: string; estimatedDurationSec: number }> } | null;
  storyboard: { scenes: Array<{ sceneIndex: number; beat: string; voiceover: string; visualPrompt: string; cameraMotion: string; keyElements: string[]; estimatedDurationSec: number; status: string; usedT2vFallback: boolean; keyframeUrl?: string }> } | null;
  final_video_url: string | null;
  style_dna: { degraded?: boolean } | null;
  error_message: string | null;
}

export default function ProjectPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'script' | 'storyboard'>('pipeline');
  const [isRefining, setIsRefining] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const {
    status: sseStatus,
    currentStep,
    totalCostUsd,
    events,
    finalVideoUrl,
    connectSSE,
    reset,
  } = useProjectStore();

  const loadProject = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      setProject(data as unknown as ProjectData);
    }
    setLoading(false);
  }, [id, supabase]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadProject();
    const cleanup = connectSSE(id);
    return () => {
      cleanup();
      reset();
    };
  }, [id, loadProject, connectSSE, reset]);

  useEffect(() => {
    if (!id) return;
    if (sseStatus === 'complete' || events.length > 0) {
      void loadProject();
    }
  }, [id, sseStatus, events.length, loadProject]);

  const handleStart = async () => {
    try {
      const response = await fetch('/api/trpc/project.start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { id } }),
      });
      if (response.ok) {
        loadProject();
      }
    } catch (err) {
      console.error('Failed to start pipeline:', err);
    }
  };

  const handleRetry = async () => {
    const failedStep = project?.current_step ?? 1;
    try {
      const response = await fetch('/api/trpc/project.retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { id, stepNumber: failedStep } }),
      });
      if (response.ok) {
        loadProject();
      }
    } catch (err) {
      console.error('Failed to retry:', err);
    }
  };

  const handleRefineAll = async (feedback: string) => {
    setIsRefining(true);
    try {
      await fetch('/api/trpc/project.refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { id, mode: 'full_script', feedback } }),
      });
    } catch (err) {
      console.error('Refine failed:', err);
    }
    setIsRefining(false);
    loadProject();
  };

  const handleRefineScene = async (sceneIndex: number, feedback: string) => {
    setIsRefining(true);
    try {
      await fetch('/api/trpc/project.refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { id, mode: 'single_scene', feedback, sceneIndex } }),
      });
    } catch (err) {
      console.error('Refine scene failed:', err);
    }
    setIsRefining(false);
    loadProject();
  };

  const handleUpdateVisuals = async (feedback: string) => {
    setIsRefining(true);
    try {
      await fetch('/api/trpc/project.refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { id, mode: 'visual_prompts', feedback } }),
      });
    } catch (err) {
      console.error('Visual update failed:', err);
    }
    setIsRefining(false);
    loadProject();
  };

  const handleSaveScene = async (sceneIndex: number, voiceover: string) => {
    try {
      await fetch('/api/trpc/scene.updateVoiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { projectId: id, sceneIndex, voiceover } }),
      });
      loadProject();
    } catch (err) {
      console.error('Save scene failed:', err);
    }
  };

  if (!id) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Invalid project link</p>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Project not found</p>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayStatus = sseStatus !== 'pending' ? sseStatus : project.status;
  const displayStep = currentStep || project.current_step;
  const displayCost = totalCostUsd || Number(project.total_cost_usd);
  const displayVideoUrl = finalVideoUrl ?? project.final_video_url;
  const isActive = displayStatus !== 'pending' && displayStatus !== 'complete' && displayStatus !== 'failed';

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-bold truncate max-w-md">{project.title}</h1>
                <p className="text-xs text-muted-foreground">{project.new_topic}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CostMeter totalCostUsd={displayCost} isActive={isActive} />
              {displayStatus === 'pending' && (
                <Button onClick={handleStart}>
                  <Play className="h-4 w-4 mr-2" /> Start Pipeline
                </Button>
              )}
              {displayStatus === 'failed' && (
                <Button variant="outline" onClick={handleRetry}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Retry
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {project.style_dna?.degraded && (
          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Degraded Style Extraction</p>
              <p className="text-xs text-muted-foreground mt-1">
                Style DNA extraction had limited confidence. Generated video may not closely match the reference style.
              </p>
            </div>
          </div>
        )}

        {project.error_message && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 mb-6">
            <p className="text-sm text-destructive">{project.error_message}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-4">
                <StepTracker
                  currentStep={displayStep}
                  status={displayStatus}
                  events={events.map((e) => ({
                    stepNumber: e.stepNumber,
                    stepName: e.stepName,
                    status: e.status,
                    durationMs: e.durationMs,
                    costUsd: e.costUsd,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {displayVideoUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Final Video
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <VideoPlayer src={displayVideoUrl} />
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2 border-b border-border">
              {(['pipeline', 'script', 'storyboard'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'pipeline' ? 'Pipeline' : tab === 'script' ? 'Script' : 'Storyboard'}
                </button>
              ))}
            </div>

            {activeTab === 'pipeline' && project.storyboard && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.storyboard.scenes.map((scene) => (
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
                  />
                ))}
              </div>
            )}

            {activeTab === 'pipeline' && !project.storyboard && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {displayStatus === 'pending' ? (
                    <p>Start the pipeline to begin generating your video.</p>
                  ) : (
                    <p>Storyboard will appear here once generated (Step 7).</p>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === 'script' && project.script && (
              <ScriptEditor
                scenes={project.script.scenes}
                onSaveScene={handleSaveScene}
                onRefineAll={handleRefineAll}
                onRefineScene={handleRefineScene}
                isRefining={isRefining}
              />
            )}

            {activeTab === 'script' && !project.script && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Script will appear here once generated (Step 5).
                </CardContent>
              </Card>
            )}

            {activeTab === 'storyboard' && project.storyboard && (
              <StoryboardEditor
                scenes={project.storyboard.scenes}
                onUpdateVisuals={handleUpdateVisuals}
                isRefining={isRefining}
              />
            )}

            {activeTab === 'storyboard' && !project.storyboard && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Storyboard will appear here once generated (Step 7).
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
