import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { supabaseAdmin } from '@/lib/supabase';
import { encrypt, decrypt, maskApiKey } from '@/lib/encryption';
import type { Provider } from '@/lib/types';

export const userRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', ctx.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newProfile } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: ctx.user.id,
          display_name: ctx.user.email?.split('@')[0] ?? 'User',
        })
        .select()
        .single();

      return newProfile;
    }

    if (error) throw new Error(error.message);
    return data;
  }),

  updateProfile: protectedProcedure
    .input(z.object({ displayName: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          id: ctx.user.id,
          display_name: input.displayName,
        });

      if (error) throw new Error(error.message);
      return { success: true };
    }),

  getApiKeys: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await supabaseAdmin
      .from('user_api_keys')
      .select('id, provider, encrypted_key, created_at')
      .eq('user_id', ctx.user.id);

    if (error) throw new Error(error.message);

    return (data ?? []).map((key) => ({
      id: key.id,
      provider: key.provider as Provider,
      maskedKey: maskApiKey(decrypt(key.encrypted_key)),
      createdAt: key.created_at,
    }));
  }),

  setApiKey: protectedProcedure
    .input(z.object({
      provider: z.enum(['google', 'openai', 'anthropic', 'elevenlabs', 'stability', 'kling', 'runway']),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const encryptedKey = encrypt(input.apiKey);

      const { error } = await supabaseAdmin
        .from('user_api_keys')
        .upsert({
          user_id: ctx.user.id,
          provider: input.provider,
          encrypted_key: encryptedKey,
        }, {
          onConflict: 'user_id,provider',
        });

      if (error) throw new Error(error.message);
      return { success: true };
    }),

  deleteApiKey: protectedProcedure
    .input(z.object({
      provider: z.enum(['google', 'openai', 'anthropic', 'elevenlabs', 'stability', 'kling', 'runway']),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await supabaseAdmin
        .from('user_api_keys')
        .delete()
        .eq('user_id', ctx.user.id)
        .eq('provider', input.provider);

      if (error) throw new Error(error.message);
      return { success: true };
    }),

  testApiKey: protectedProcedure
    .input(z.object({
      provider: z.enum(['google', 'openai', 'anthropic', 'elevenlabs', 'stability', 'kling', 'runway']),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      try {
        switch (input.provider) {
          case 'google': {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const client = new GoogleGenerativeAI(input.apiKey);
            const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
            await model.generateContent('Say "hello"');
            return { valid: true, message: 'Google AI API key is valid' };
          }
          case 'openai': {
            const { default: OpenAI } = await import('openai');
            const client = new OpenAI({ apiKey: input.apiKey });
            await client.models.list();
            return { valid: true, message: 'OpenAI API key is valid' };
          }
          case 'anthropic': {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': input.apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }],
              }),
            });
            if (response.ok) return { valid: true, message: 'Anthropic API key is valid' };
            return { valid: false, message: 'Invalid Anthropic API key' };
          }
          case 'elevenlabs': {
            const response = await fetch('https://api.elevenlabs.io/v1/user', {
              headers: { 'xi-api-key': input.apiKey },
            });
            if (response.ok) return { valid: true, message: 'ElevenLabs API key is valid' };
            return { valid: false, message: 'Invalid ElevenLabs API key' };
          }
          default:
            return { valid: true, message: `${input.provider} key saved (validation not implemented)` };
        }
      } catch {
        return { valid: false, message: `Failed to validate ${input.provider} API key` };
      }
    }),
});
