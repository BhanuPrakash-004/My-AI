import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config.js';

let client;
// Reads ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) from the environment.
const getClient = () => (client ??= new Anthropic());

export const claudeProvider = {
  id: 'claude',
  model: config.claude.model,

  /**
   * Streams a reply from Claude.
   * Yields { type: 'text', text } for each text delta, then
   * { type: 'done', model, stopReason } once the message is complete.
   */
  async *streamReply({ system, messages, signal }) {
    const params = {
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      system,
      messages,
      output_config: { effort: config.claude.effort },
    };

    if (config.claude.fallbacks) {
      // If a safety classifier declines, the API re-runs the request on a
      // fallback model inside the same stream.
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }

    const stream = getClient().beta.messages.stream(params, { signal });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    yield { type: 'done', model: final.model, stopReason: final.stop_reason };
  },
};

/** Turns SDK errors into a message the user can act on. */
export function describeClaudeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in server/.env and restart the server.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'This API key does not have access to the configured model. Check TIMBRE_MODEL in server/.env.';
  }
  if (error instanceof Anthropic.NotFoundError) {
    return `The model "${config.claude.model}" was not found. Check TIMBRE_MODEL in server/.env.`;
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Claude is rate limited right now. Wait a few seconds and try again.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `Claude rejected the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Claude API. Check your internet connection and try again.';
  }
  if (error instanceof Anthropic.APIError && error.status >= 500) {
    return 'Claude is temporarily unavailable. Try again in a moment.';
  }
  return null;
}
