const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function readError(response) {
  const data = await response.json().catch(() => null);
  if (data?.error) return data.error;
  if (response.status === 502 || response.status === 504) {
    return 'Cannot reach the server. Make sure it is running on port 5000.';
  }
  return `Request failed with status ${response.status}.`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, { headers: JSON_HEADERS, ...options });
  } catch {
    throw new Error('Cannot reach the server. Make sure it is running.');
  }
  if (!response.ok) throw new Error(await readError(response));
  if (response.status === 204) return null;
  return response.json();
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  health: () => request('/health'),

  listConversations: (q = '') => request(`/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getConversation: (id) => request(`/conversations/${id}`),
  updateConversation: (id, body) => request(`/conversations/${id}`, json('PATCH', body)),
  deleteConversation: (id) => request(`/conversations/${id}`, { method: 'DELETE' }),
  branchConversation: (id, exchangeId) => request(`/conversations/${id}/branch`, json('POST', { exchangeId })),
  selectCandidate: (id, exchangeId, candidate) =>
    request(`/conversations/${id}/exchanges/${exchangeId}/select`, json('POST', { candidate })),

  listTones: () => request('/tones'),
  saveTone: (id, instruction) => request(`/tones/${id}`, json('PUT', { instruction })),
  resetTone: (id) => request(`/tones/${id}`, { method: 'DELETE' }),
};

/** Splits a Server-Sent Events buffer into complete events plus the unfinished rest. */
export function parseEventStream(buffer) {
  const events = [];
  let rest = buffer.replace(/\r\n/g, '\n');
  let boundary;
  while ((boundary = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);

    let name = 'message';
    const dataLines = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue; // keep-alive comment
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) events.push({ name, data: JSON.parse(dataLines.join('\n')) });
  }
  return { events, rest };
}

/**
 * POSTs a chat message and reads the Server-Sent Events stream.
 * Calls onEvent(name, data) for each event: meta, delta, candidate, done, error.
 */
export async function streamChat(body, { onEvent, signal }) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the server. Make sure it is running.');
  }

  if (!response.ok) throw new Error(await readError(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const parsed = parseEventStream(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const event of parsed.events) onEvent(event.name, event.data);
  }
}
