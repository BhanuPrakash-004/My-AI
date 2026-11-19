/**
 * Turns an SDK error (Anthropic or OpenAI; both expose `status`) into a
 * message the user can act on.
 */
export function describeProviderError(error, { providerLabel, model }) {
  const status = error?.status;
  if (status === 401) {
    return `${providerLabel} rejected the API key. Check AI_API_KEY in server/.env and restart the server.`;
  }
  if (status === 403) {
    return `This API key does not have access to "${model}". Check AI_MODEL in server/.env.`;
  }
  if (status === 404) {
    return `The model "${model}" was not found. Check AI_MODEL (and AI_BASE_URL) in server/.env.`;
  }
  if (status === 429) {
    return `${providerLabel} is rate limiting requests right now. Wait a few seconds and try again.`;
  }
  if (status === 400 || status === 422) {
    return `${providerLabel} rejected the request: ${error.message}`;
  }
  if (typeof status === 'number' && status >= 500) {
    return `${providerLabel} is temporarily unavailable. Try again in a moment.`;
  }
  if (error?.name === 'APIConnectionError' || error?.name === 'APIConnectionTimeoutError') {
    return `Could not reach ${providerLabel}. Check your internet connection and AI_BASE_URL.`;
  }
  return 'Something went wrong while generating the reply. Try again in a moment.';
}
