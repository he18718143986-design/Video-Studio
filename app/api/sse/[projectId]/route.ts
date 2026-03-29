import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

function createRouteSupabaseClient(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = createRouteSupabaseClient(request);

  if (!supabase) {
    return new Response('Supabase auth is not configured.', { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, status, current_step, total_cost_usd, final_video_url')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
    return new Response('Project not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let pollInterval: ReturnType<typeof setInterval> | null = null;
      let streamRotateTimer: ReturnType<typeof setTimeout> | null = null;
      let channel: ReturnType<typeof supabaseAdmin.channel> | null = null;
      let closed = false;

      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream may be closed
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;

        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }

        if (streamRotateTimer) {
          clearTimeout(streamRotateTimer);
          streamRotateTimer = null;
        }

        if (channel) {
          void channel.unsubscribe();
          channel = null;
        }

        try {
          controller.close();
        } catch {
          // Stream may already be closed
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

        sendEvent({
          type: 'project_status',
          data: {
            status: project.status,
            currentStep: project.current_step,
            totalCostUsd: project.total_cost_usd,
            finalVideoUrl: project.final_video_url,
          },
        });

        channel = supabaseAdmin
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

        pollInterval = setInterval(async () => {
          const { data: latestProject } = await supabaseAdmin
            .from('projects')
            .select('status, current_step, total_cost_usd, final_video_url')
            .eq('id', projectId)
            .eq('user_id', user.id)
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

        // Vercel may hard-stop long-running connections near maxDuration.
        // Rotate the stream slightly earlier to reconnect cleanly on the client.
        streamRotateTimer = setTimeout(() => {
          cleanup();
        }, 55_000);

        request.signal.addEventListener('abort', cleanup);
      } catch (error) {
        sendEvent({ type: 'error', data: { message: String(error) } });
        cleanup();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
