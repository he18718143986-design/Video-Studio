import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'ai-science-video-generator',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export type PipelineEventData = {
  projectId: string;
};

export type Events = {
  'pipeline/step-1.requested': { data: PipelineEventData };
  'pipeline/step-2a.requested': { data: PipelineEventData };
  'pipeline/step-2b.requested': { data: PipelineEventData };
  'pipeline/step-3.requested': { data: PipelineEventData };
  'pipeline/step-4.requested': { data: PipelineEventData };
  'pipeline/step-5.requested': { data: PipelineEventData };
  'pipeline/step-6.requested': { data: PipelineEventData };
  'pipeline/step-7.requested': { data: PipelineEventData };
  'pipeline/step-8.requested': { data: PipelineEventData };
  'pipeline/step-9.requested': { data: PipelineEventData };
  'pipeline/step-10.requested': { data: PipelineEventData };
  'pipeline/step-11.requested': { data: PipelineEventData };
  'pipeline/step-12.requested': { data: PipelineEventData };
  'pipeline/step-13.requested': { data: PipelineEventData & { mode: string; feedback: string; sceneIndex?: number } };
};
