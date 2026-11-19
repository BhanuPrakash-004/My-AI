import OpenAI from 'openai';
import { THINKING_LEVELS } from '../thinking.js';

const FINISH_TO_STOP_REASON = {
  stop: 'end_turn',
  length: 'max_tokens',
  content_filter: 'refusal',
  tool_calls: 'tool_use',
};

/**
 * OpenAI Chat Completions provider. Works with api.openai.com and with any
 * OpenAI-compatible server through AI_BASE_URL (Azure, OpenRouter, Groq,
 * Ollama, LM Studio, ...).
 */
export function createOpenAIProvider({ apiKey, baseURL, client } = {}) {
  const sdk =
    client ??
    new OpenAI({
      // Local OpenAI-compatible servers usually ignore the key, but the SDK requires one.
      apiKey: apiKey || 'not-needed',
      ...(baseURL ? { baseURL } : {}),
    });
  const noReasoning = new Set(); // models that rejected reasoning_effort

  const buildParams = ({ model, system, messages, thinking }) => {
    const params = {
      model,
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages],
    };
    const effort = THINKING_LEVELS[thinking]?.openaiEffort;
    if (effort && !noReasoning.has(model)) params.reasoning_effort = effort;
    return params;
  };

  return {
    provider: 'openai',
    providerLabel: 'OpenAI',

    async *streamReply({ model, system, messages, thinking, signal }) {
      let stream;
      try {
        stream = await sdk.chat.completions.create(buildParams({ model, system, messages, thinking }), { signal });
      } catch (error) {
        // Non-reasoning models (and some compatible servers) reject reasoning_effort.
        const rejectedReasoning =
          error?.status === 400 && /reasoning/i.test(error.message ?? '') && !noReasoning.has(model);
        if (!rejectedReasoning) throw error;
        noReasoning.add(model);
        stream = await sdk.chat.completions.create(buildParams({ model, system, messages, thinking }), { signal });
      }

      let finishReason = null;
      let servedModel = model;
      for await (const chunk of stream) {
        if (chunk.model) servedModel = chunk.model;
        const choice = chunk.choices?.[0];
        const text = choice?.delta?.content;
        if (text) yield { type: 'text', text };
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }

      yield {
        type: 'done',
        model: servedModel,
        stopReason: FINISH_TO_STOP_REASON[finishReason] ?? finishReason,
      };
    },
  };
}
