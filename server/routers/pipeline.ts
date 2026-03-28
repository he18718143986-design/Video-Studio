import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '@/lib/supabase';

export const pipelineRouter = router({
  getEvents: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('id', input.projectId)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');

      const { data, error } = await supabaseAdmin
        .from('pipeline_events')
        .select('*')
        .eq('project_id', input.projectId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  getStatus: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('status, current_step, total_cost_usd, error_message')
        .eq('id', input.projectId)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');
      return project;
    }),
});
