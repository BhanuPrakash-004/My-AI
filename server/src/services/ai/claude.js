import Anthropic from '@anthropic-ai/sdk';
import { THINKING_LEVELS } from '../thinking.js';

// Some models or proxies reject optional parameters. When the API says so
// (HTTP 400 before any output), retry once without that parameter and
// remember the result for that model.
function detectUnsupported(message, skipped) {
  if (/fallback/i.test(message) && !skipped.has('fallbacks')) return 'fallbacks';
  if (/effort|output_config/i.test(message) && !skipped.has('effort')) return 'effort';
  return null;
}

export function createClaudeProvider({ apiKey, authToken, baseURL, maxTokens = 64000, fallbacks = true, client } = {}) {
  const sdk =
    client ??
    new Anthropic({
      ...(apiKey ? { apiKey } : {}),
      ...(authToken && !apiKey ? { authToken } : {}),
      ...(baseURL ? { baseURL } : {}),
    });
  const quirks = new Map(); // model -> Set of parameters it rejected

  return {
    provider: 'claude',
    providerLabel: 'Anthropic',

    /**
     * Streams a reply. Yields { type: 'text', text } per text delta, then
     * { type: 'done', model, stopReason } once the message is complete.
     */
    async *streamReply({ model, system, messages, thinking, signal }) {
      const skipped = quirks.get(model) ?? new Set();

      for (let attempt = 0; ; attempt++) {
        const params = { model, max_tokens: maxTokens, system, messages };
        const effort = THINKING_LEVELS[thinking]?.claudeEffort;
        if (effort && !skipped.has('effort')) params.output_config = { effort };
        if (fallbacks && !skipped.has('fallbacks')) {
          // If a safety classifier declines, the API re-runs the request on a
          // fallback model inside the same stream.
          params.betas = ['server-side-fallback-2026-07-01'];
          params.fallbacks = 'default';
        }

        const stream = sdk.beta.messages.stream(params, { signal });
        let produced = false;
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              produced = true;
              yield { type: 'text', text: event.delta.text };
            }
          }
          const final = await stream.finalMessage();
          yield { type: 'done', model: final.model, stopReason: final.stop_reason };
          return;
        } catch (error) {
          const unsupported =
            !produced && error?.status === 400 && attempt < 2 && detectUnsupported(error.message ?? '', skipped);
          if (!unsupported) throw error;
          skipped.add(unsupported);
          quirks.set(model, skipped);
        }
      }
    },
  };
}
