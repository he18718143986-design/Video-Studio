import { create } from 'zustand';
import type { PipelineEvent, ProjectStatus } from '@/lib/types';

interface SSEEvent {
  type: 'pipeline_event' | 'project_status' | 'replay_complete' | 'error';
  data: Record<string, unknown>;
}

interface ProjectState {
  projectId: string | null;
  status: ProjectStatus;
  currentStep: number;
  totalCostUsd: number;
  finalVideoUrl: string | null;
  events: PipelineEvent[];
  isConnected: boolean;
  error: string | null;

  setProjectId: (id: string) => void;
  addEvent: (event: PipelineEvent) => void;
  setStatus: (status: ProjectStatus) => void;
  setCurrentStep: (step: number) => void;
  setTotalCostUsd: (cost: number) => void;
  setFinalVideoUrl: (url: string | null) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  connectSSE: (projectId: string) => () => void;
}

const initialState = {
  projectId: null,
  status: 'pending' as ProjectStatus,
  currentStep: 0,
  totalCostUsd: 0,
  finalVideoUrl: null,
  events: [] as PipelineEvent[],
  isConnected: false,
  error: null,
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...initialState,

  setProjectId: (id) => set({ projectId: id }),

  addEvent: (event) =>
    set((state) => ({
      events: [...state.events, event],
    })),

  setStatus: (status) => set({ status }),
  setCurrentStep: (step) => set({ currentStep: step }),
  setTotalCostUsd: (cost) => set({ totalCostUsd: cost }),
  setFinalVideoUrl: (url) => set({ finalVideoUrl: url }),
  setConnected: (connected) => set({ isConnected: connected }),
  setError: (error) => set({ error }),

  reset: () => set(initialState),

  connectSSE: (projectId: string) => {
    const state = get();
    state.setProjectId(projectId);
    state.setConnected(true);

    let eventSource: EventSource | null = null;

    const open = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      eventSource = new EventSource(`/api/sse/${projectId}`);

      const es = eventSource;

      es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as SSEEvent;
        const currentState = get();

        switch (parsed.type) {
          case 'pipeline_event': {
            const pipelineEvent: PipelineEvent = {
              projectId: (parsed.data['projectId'] as string) ?? projectId,
              stepNumber: (parsed.data['stepNumber'] as number) ?? 0,
              stepName: (parsed.data['stepName'] as string) ?? '',
              status: (parsed.data['status'] as PipelineEvent['status']) ?? 'started',
              message: parsed.data['message'] as string | undefined,
              costUsd: parsed.data['costUsd'] as number | undefined,
              modelUsed: parsed.data['modelUsed'] as string | undefined,
              durationMs: parsed.data['durationMs'] as number | undefined,
            };
            currentState.addEvent(pipelineEvent);
            break;
          }

          case 'project_status': {
            if (parsed.data['status']) {
              currentState.setStatus(parsed.data['status'] as ProjectStatus);
            }
            if (typeof parsed.data['currentStep'] === 'number') {
              currentState.setCurrentStep(parsed.data['currentStep'] as number);
            }
            if (typeof parsed.data['totalCostUsd'] === 'number') {
              currentState.setTotalCostUsd(parsed.data['totalCostUsd'] as number);
            }
            if (parsed.data['finalVideoUrl']) {
              currentState.setFinalVideoUrl(parsed.data['finalVideoUrl'] as string);
            }
            break;
          }

          case 'error': {
            currentState.setError(parsed.data['message'] as string);
            break;
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

      es.onerror = () => {
        const currentState = get();
        currentState.setConnected(false);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        setTimeout(() => {
          const latestState = get();
          if (latestState.projectId === projectId) {
            open();
          }
        }, 3000);
      };
    };

    open();

    return () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      set({ isConnected: false });
    };
  },
}));
