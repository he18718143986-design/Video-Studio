import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '@/lib/supabase';

export const sceneRouter = router({
  list: protectedProcedure
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
        .from('scenes')
        .select('*')
        .eq('project_id', input.projectId)
        .order('scene_index');

      if (error) throw new Error(error.message);
      return data ?? [];
    }),

  updateVoiceover: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sceneIndex: z.number().int(),
      voiceover: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('id', input.projectId)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');

      const { error } = await supabaseAdmin
        .from('scenes')
        .update({ voiceover_text: input.voiceover })
        .eq('project_id', input.projectId)
        .eq('scene_index', input.sceneIndex);

      if (error) throw new Error(error.message);
      return { success: true };
    }),

  updateVisualPrompt: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      sceneIndex: z.number().int(),
      visualPrompt: z.string().min(1),
      cameraMotion: z.string().optional(),
      keyElements: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('id', input.projectId)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');

      const updateData: Record<string, unknown> = {
        visual_prompt: input.visualPrompt,
      };

      if (input.cameraMotion) updateData['camera_motion'] = input.cameraMotion;
      if (input.keyElements) updateData['key_elements'] = input.keyElements;

      const { error } = await supabaseAdmin
        .from('scenes')
        .update(updateData)
        .eq('project_id', input.projectId)
        .eq('scene_index', input.sceneIndex);

      if (error) throw new Error(error.message);
      return { success: true };
    }),
});
