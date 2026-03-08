'use client';

import { cn } from '@/lib/utils';
import { PIPELINE_STEP_NAMES } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

interface StepTrackerProps {
  currentStep: number;
  status: string;
  events: Array<{
    stepNumber: number;
    stepName: string;
    status: string;
    durationMs?: number;
    costUsd?: number;
  }>;
}

const STEPS = [
  { number: 1, key: 'step_1_safety', label: 'Safety Pre-check' },
  { number: 2, key: 'step_2a_capability_assessment', label: 'Style Analysis' },
  { number: 3, key: 'step_3_research', label: 'Deep Research' },
  { number: 4, key: 'step_4_narrative_map', label: 'Narrative Map' },
  { number: 5, key: 'step_5_script', label: 'Script Generation' },
  { number: 6, key: 'step_6_qa_audit', label: 'QA Audit' },
  { number: 7, key: 'step_7_storyboard', label: 'Storyboard' },
  { number: 8, key: 'step_8_reference_sheet', label: 'Style Reference' },
  { number: 9, key: 'step_9_keyframes', label: 'Keyframe Generation' },
  { number: 10, key: 'step_10_video_gen', label: 'Video Generation' },
  { number: 11, key: 'step_11_tts', label: 'Voice Generation' },
  { number: 12, key: 'step_12_render', label: 'Final Rendering' },
];

export function StepTracker({ currentStep, status, events }: StepTrackerProps) {
  const getStepStatus = (stepNumber: number): 'pending' | 'running' | 'completed' | 'failed' => {
    if (status === 'failed') {
      const failedEvent = events.find((e) => e.stepNumber === stepNumber && e.status === 'failed');
      if (failedEvent) return 'failed';
    }

    const completedEvent = events.find((e) => e.stepNumber === stepNumber && e.status === 'completed');
    if (completedEvent) return 'completed';

    const startedEvent = events.find((e) => e.stepNumber === stepNumber && e.status === 'started');
    const hasCompleted = events.find((e) => e.stepNumber === stepNumber && e.status === 'completed');
    if (startedEvent && !hasCompleted) return 'running';

    if (stepNumber <= currentStep) return 'completed';

    return 'pending';
  };

  const getStepDuration = (stepNumber: number): number | undefined => {
    const event = events.find((e) => e.stepNumber === stepNumber && e.status === 'completed');
    return event?.durationMs;
  };

  const getStepCost = (stepNumber: number): number | undefined => {
    const event = events.find((e) => e.stepNumber === stepNumber && e.status === 'completed');
    return event?.costUsd;
  };

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Pipeline Progress
      </h3>
      {STEPS.map((step, index) => {
        const stepStatus = getStepStatus(step.number);
        const duration = getStepDuration(step.number);
        const cost = getStepCost(step.number);

        return (
          <div key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all',
                stepStatus === 'completed' && 'border-green-500 bg-green-500/10',
                stepStatus === 'running' && 'border-blue-500 bg-blue-500/10',
                stepStatus === 'failed' && 'border-red-500 bg-red-500/10',
                stepStatus === 'pending' && 'border-muted-foreground/30 bg-transparent',
              )}>
                {stepStatus === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {stepStatus === 'running' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                {stepStatus === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                {stepStatus === 'pending' && <Circle className="h-4 w-4 text-muted-foreground/30" />}
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  'w-0.5 h-6 mt-1',
                  stepStatus === 'completed' ? 'bg-green-500/50' : 'bg-muted-foreground/20',
                )} />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-4">
              <div className="flex items-center justify-between">
                <p className={cn(
                  'text-sm font-medium truncate',
                  stepStatus === 'completed' && 'text-green-400',
                  stepStatus === 'running' && 'text-blue-400',
                  stepStatus === 'failed' && 'text-red-400',
                  stepStatus === 'pending' && 'text-muted-foreground/50',
                )}>
                  {step.label}
                </p>
                {cost !== undefined && cost > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ${cost.toFixed(4)}
                  </span>
                )}
              </div>
              {duration !== undefined && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(duration / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
