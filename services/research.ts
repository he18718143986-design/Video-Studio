import type { ResearchReport, StyleDNA, Provider } from '@/lib/types';
import { selectModel } from './modelRegistry';
import * as geminiAdapter from './adapters/geminiAdapter';
import * as openaiAdapter from './adapters/openaiAdapter';
import * as anthropicAdapter from './adapters/anthropicAdapter';
import { calculateCost } from './observability';

export async function runDeepResearch(
  topic: string,
  styleDNA: StyleDNA,
  availableProviders: Record<Provider, boolean>,
  apiKeys?: Record<string, string>
): Promise<{ report: ResearchReport; costUsd: number; model: string }> {
  const { provider, model } = selectModel('step_3_research', availableProviders);

  const vocabularyLevel = styleDNA.scriptPipeline?.vocabularyLevel ?? 'intermediate';
  const narrativeStructure = styleDNA.scriptPipeline?.narrativeStructure ?? ['hook', 'context', 'explanation', 'conclusion'];

  const prompt = `You are a rigorous scientific researcher and fact-checker for educational video content.

Research the topic "${topic}" thoroughly and produce a structured fact sheet.

Requirements:
1. Provide 5-7 distinct verifiable scientific facts about "${topic}".
   Map each fact to a narrative beat from this structure: ${JSON.stringify(narrativeStructure)}
   Each fact should serve a different part of the story arc.

2. Identify 3 common misconceptions about "${topic}" that people typically believe,
   and provide the correct information to debunk each one.

3. Define 3-4 key technical terms related to "${topic}" with simple, accessible definitions
   suitable for a "${vocabularyLevel}" vocabulary level audience.

4. Create 2-3 concrete analogies that make complex aspects of "${topic}" easy to understand.
   These analogies should be vivid, relatable, and suitable for a "${vocabularyLevel}" audience.

Return ONLY valid JSON (no markdown code fences) matching this exact schema:
{
  "topic": "${topic}",
  "facts": [
    { "id": "fact_1", "text": "clear factual statement", "source": "field of study or well-known source" }
  ],
  "misconceptions": [
    { "id": "misc_1", "myth": "what people wrongly believe", "correction": "the actual truth" }
  ],
  "terms": [
    { "id": "term_1", "term": "technical term", "definition": "simple definition" }
  ],
  "analogies": [
    { "id": "analogy_1", "analogy": "vivid analogy description", "targetConcept": "concept being explained" }
  ]
}`;

  let text: string;
  let inputTokens = 0;
  let outputTokens = 0;

  switch (provider) {
    case 'google': {
      try {
        const result = await geminiAdapter.generateWithSearchGrounding({
          model,
          prompt,
          apiKey: apiKeys?.['google'],
        });
        text = result.text;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
      } catch {
        const result = await geminiAdapter.generateText({
          model,
          prompt,
          apiKey: apiKeys?.['google'],
        });
        text = result.text;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
      }
      break;
    }
    case 'openai': {
      const result = await openaiAdapter.generateText({
        model,
        prompt,
        apiKey: apiKeys?.['openai'],
      });
      text = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      break;
    }
    case 'anthropic': {
      const result = await anthropicAdapter.generateText({
        model,
        prompt,
        apiKey: apiKeys?.['anthropic'],
      });
      text = result.text;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      break;
    }
    default:
      throw new Error(`Unsupported provider for research: ${provider}`);
  }

  const costUsd = calculateCost(model, { inputTokens, outputTokens });

  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const report = JSON.parse(cleaned) as ResearchReport;
    return { report, costUsd, model };
  } catch {
    return {
      report: {
        topic,
        facts: [
          { id: 'fact_1', text: `${topic} is a fascinating scientific subject.`, source: 'General knowledge' },
          { id: 'fact_2', text: `Research on ${topic} has advanced significantly in recent decades.`, source: 'Scientific literature' },
          { id: 'fact_3', text: `Understanding ${topic} is crucial for modern science.`, source: 'Academic consensus' },
          { id: 'fact_4', text: `${topic} involves complex interconnected systems.`, source: 'Systems biology' },
          { id: 'fact_5', text: `New discoveries about ${topic} continue to emerge.`, source: 'Current research' },
        ],
        misconceptions: [
          { id: 'misc_1', myth: `${topic} is simple to understand.`, correction: `${topic} involves many complex mechanisms that scientists are still studying.` },
          { id: 'misc_2', myth: `We know everything about ${topic}.`, correction: `There are still many unanswered questions about ${topic}.` },
          { id: 'misc_3', myth: `${topic} works in isolation.`, correction: `${topic} is deeply interconnected with other systems.` },
        ],
        terms: [
          { id: 'term_1', term: topic, definition: `The scientific study and understanding of ${topic}.` },
          { id: 'term_2', term: 'mechanism', definition: 'The way something works at a fundamental level.' },
          { id: 'term_3', term: 'system', definition: 'A set of connected parts working together.' },
        ],
        analogies: [
          { id: 'analogy_1', analogy: `Think of ${topic} like a well-orchestrated symphony.`, targetConcept: topic },
          { id: 'analogy_2', analogy: `${topic} is similar to a complex machine with many moving parts.`, targetConcept: `${topic} complexity` },
        ],
      },
      costUsd,
      model,
    };
  }
}
