import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may be closed
        }
      };

      try {
        const { data: existingEvents } = await supabaseAdmin
          .from('pipeline_events')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        if (existingEvents) {
          for (const event of existingEvents) {
            sendEvent({
              type: 'pipeline_event',
              data: {
                projectId: event.project_id,
                stepNumber: event.step_number,
                stepName: event.step_name,
                status: event.status,
                message: event.message,
                costUsd: event.cost_usd,
                modelUsed: event.model_used,
                durationMs: event.duration_ms,
                createdAt: event.created_at,
              },
            });
          }
        }

        sendEvent({ type: 'replay_complete', data: { count: existingEvents?.length ?? 0 } });

        const { data: project } = await supabaseAdmin
          .from('projects')
          .select('status, current_step, total_cost_usd')
          .eq('id', projectId)
          .single();

        if (project) {
          sendEvent({
            type: 'project_status',
            data: {
              status: project.status,
              currentStep: project.current_step,
              totalCostUsd: project.total_cost_usd,
            },
          });
        }

        const channel = supabaseAdmin
          .channel(`pipeline-events-${projectId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'pipeline_events',
              filter: `project_id=eq.${projectId}`,
            },
            (payload) => {
              const record = payload.new as Record<string, unknown>;
              sendEvent({
                type: 'pipeline_event',
                data: {
                  projectId: record['project_id'],
                  stepNumber: record['step_number'],
                  stepName: record['step_name'],
                  status: record['status'],
                  message: record['message'],
                  costUsd: record['cost_usd'],
                  modelUsed: record['model_used'],
                  durationMs: record['duration_ms'],
                  createdAt: record['created_at'],
                },
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'projects',
              filter: `id=eq.${projectId}`,
            },
            (payload) => {
              const record = payload.new as Record<string, unknown>;
              sendEvent({
                type: 'project_status',
                data: {
                  status: record['status'],
                  currentStep: record['current_step'],
                  totalCostUsd: record['total_cost_usd'],
                  finalVideoUrl: record['final_video_url'],
                },
              });
            }
          )
          .subscribe();

        const pollInterval = setInterval(async () => {
          const { data: latestProject } = await supabaseAdmin
            .from('projects')
            .select('status, current_step, total_cost_usd, final_video_url')
            .eq('id', projectId)
            .single();

          if (latestProject) {
            sendEvent({
              type: 'project_status',
              data: {
                status: latestProject.status,
                currentStep: latestProject.current_step,
                totalCostUsd: latestProject.total_cost_usd,
                finalVideoUrl: latestProject.final_video_url,
              },
            });
          }
        }, 5000);

        request.signal.addEventListener('abort', () => {
          clearInterval(pollInterval);
          channel.unsubscribe();
          controller.close();
        });
      } catch (error) {
        sendEvent({ type: 'error', data: { message: String(error) } });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
