import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { step1Safety } from '@/inngest/functions/step1Safety';
import { step2aCapabilityAssessment } from '@/inngest/functions/step2aCapabilityAssessment';
import { step2bStyleDnaExtraction } from '@/inngest/functions/step2bStyleDnaExtraction';
import { step3Research } from '@/inngest/functions/step3Research';
import { step4NarrativeMap } from '@/inngest/functions/step4NarrativeMap';
import { step5Script } from '@/inngest/functions/step5Script';
import { step6QaAudit } from '@/inngest/functions/step6QaAudit';
import { step7Storyboard } from '@/inngest/functions/step7Storyboard';
import { step8ReferenceSheet } from '@/inngest/functions/step8ReferenceSheet';
import { step9Keyframes } from '@/inngest/functions/step9Keyframes';
import { step10VideoGen } from '@/inngest/functions/step10VideoGen';
import { step11Tts } from '@/inngest/functions/step11Tts';
import { step12Render } from '@/inngest/functions/step12Render';
import { step13Refinement } from '@/inngest/functions/step13Refinement';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    step1Safety,
    step2aCapabilityAssessment,
    step2bStyleDnaExtraction,
    step3Research,
    step4NarrativeMap,
    step5Script,
    step6QaAudit,
    step7Storyboard,
    step8ReferenceSheet,
    step9Keyframes,
    step10VideoGen,
    step11Tts,
    step12Render,
    step13Refinement,
  ],
});
