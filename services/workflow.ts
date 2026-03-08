import { inngest } from '@/inngest/client';

export async function startPipeline(projectId: string): Promise<void> {
  await inngest.send({
    name: 'pipeline/step-1.requested',
    data: { projectId },
  });
}

export async function triggerRefinement(
  projectId: string,
  mode: 'full_script' | 'single_scene' | 'visual_prompts',
  feedback: string,
  sceneIndex?: number
): Promise<void> {
  await inngest.send({
    name: 'pipeline/step-13.requested',
    data: { projectId, mode, feedback, sceneIndex },
  });
}

export async function retryFromStep(projectId: string, stepNumber: number): Promise<void> {
  const stepEventMap: Record<number, string> = {
    1: 'pipeline/step-1.requested',
    2: 'pipeline/step-2a.requested',
    3: 'pipeline/step-3.requested',
    4: 'pipeline/step-4.requested',
    5: 'pipeline/step-5.requested',
    6: 'pipeline/step-6.requested',
    7: 'pipeline/step-7.requested',
    8: 'pipeline/step-8.requested',
    9: 'pipeline/step-9.requested',
    10: 'pipeline/step-10.requested',
    11: 'pipeline/step-11.requested',
    12: 'pipeline/step-12.requested',
  };

  const eventName = stepEventMap[stepNumber];
  if (!eventName) throw new Error(`Invalid step number: ${stepNumber}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await inngest.send({ name: eventName, data: { projectId } } as any);
}
