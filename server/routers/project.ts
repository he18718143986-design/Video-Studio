import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '@/lib/supabase';
import { startPipeline, triggerRefinement, retryFromStep } from '@/services/workflow';
import { preflightCheck, getAvailableProvidersFromKeys } from '@/services/modelRegistry';
import { decrypt } from '@/lib/encryption';
import { checkUserQuota } from '@/services/quota';
import type { Provider } from '@/lib/types';

export const projectRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        referenceVideoUrl: z.string().nullable(),
        newTopic: z.string().min(1),
        targetDurationSec: z.number().int().min(30).max(300).default(120),
        quality: z.enum(['fast', 'high']).default('fast'),
        language: z.string().default('auto'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const quota = await checkUserQuota(ctx.user.id);
      if (!quota.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: quota.reason ?? 'Quota exceeded' });
      }

      const { data, error } = await supabaseAdmin.from('projects').insert({
        user_id: ctx.user.id,
        title: input.title,
        reference_video_url: input.referenceVideoUrl,
        new_topic: input.newTopic,
        target_duration_sec: input.targetDurationSec,
        quality: input.quality,
        language: input.language,
        status: 'pending',
        current_step: 0,
      }).select().single();

      if (error) throw new Error(error.message);
      return data;
    }),

  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        perPage: z.number().int().min(1).max(50).default(12),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.perPage;

      const { data, error, count } = await supabaseAdmin
        .from('projects')
        .select('*', { count: 'exact' })
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + input.perPage - 1);

      if (error) throw new Error(error.message);

      return {
        projects: data ?? [],
        total: count ?? 0,
        page: input.page,
        perPage: input.perPage,
        totalPages: Math.ceil((count ?? 0) / input.perPage),
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', input.id)
        .eq('user_id', ctx.user.id)
        .single();

      if (error || !data) throw new Error('Project not found');
      return data;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', input.id)
        .eq('user_id', ctx.user.id);

      if (error) throw new Error(error.message);
      return { success: true };
    }),

  start: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', input.id)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');

      await supabaseAdmin
        .from('projects')
        .update({ status: 'step_1', current_step: 0 })
        .eq('id', input.id);

      await startPipeline(input.id);
      return { success: true };
    }),

  retry: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      stepNumber: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', input.id)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');

      await retryFromStep(input.id, input.stepNumber);
      return { success: true };
    }),

  refine: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      mode: z.enum(['full_script', 'single_scene', 'visual_prompts']),
      feedback: z.string().min(1),
      sceneIndex: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('id', input.id)
        .eq('user_id', ctx.user.id)
        .single();

      if (!project) throw new Error('Project not found');

      await triggerRefinement(input.id, input.mode, input.feedback, input.sceneIndex);
      return { success: true };
    }),

  preflight: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { data: keys } = await supabaseAdmin
        .from('user_api_keys')
        .select('provider, encrypted_key')
        .eq('user_id', ctx.user.id);

      const apiKeys: Array<{ provider: Provider }> = [];
      if (keys) {
        for (const key of keys) {
          try {
            decrypt(key.encrypted_key);
            apiKeys.push({ provider: key.provider as Provider });
          } catch {
            // Skip invalid keys
          }
        }
      }

      const availableProviders = getAvailableProvidersFromKeys(apiKeys);
      const modelPlan = preflightCheck(availableProviders);

      return modelPlan;
    }),

  quota: protectedProcedure
    .query(async ({ ctx }) => {
      const quota = await checkUserQuota(ctx.user.id);
      return quota;
    }),
});
