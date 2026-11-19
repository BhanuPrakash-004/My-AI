// Demo provider used when no Anthropic credentials are configured.
// It streams a sample reply written in the selected tone so the whole
// app (streaming, persistence, tone toggle) can be tried without a key.

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });

function abortError() {
  const error = new Error('Request aborted');
  error.name = 'AbortError';
  return error;
}

const excerpt = (text, max = 70) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max).trim()}…` : line;
};

const replies = {
  professional: (prompt) => `Thank you for your message. Timbre is currently running in **demo mode**, so this is a sample reply rather than a live answer to “${excerpt(prompt)}”.

Once an Anthropic API key is configured, each request works as follows:

1. Your message and the earlier turns of this conversation are sent to the server.
2. The server adds the **Professional** tone as a system instruction and calls the Claude API.
3. The reply streams back to this window and is saved to MongoDB with its timestamp.

To enable live answers, add \`ANTHROPIC_API_KEY\` to \`server/.env\` and restart the server.`,

  casual: (prompt) => `Hey! 👋 Quick heads-up: I'm in **demo mode** right now, so I can't really answer “${excerpt(prompt)}” yet. This is just a sample reply.

Here's the fun part, though. Flip the tone switch and send another message, and you'll see how the vibe changes. Right now we're on **Casual**, so everything's nice and chill.

Want the real thing? Pop your key into \`server/.env\` like this:

\`\`\`bash
ANTHROPIC_API_KEY=sk-ant-...
\`\`\`

Restart the server and you're good to go!`,

  concise: (prompt) => `Demo mode: no API key set, so this is a sample reply to “${excerpt(prompt, 40)}”.

- Add \`ANTHROPIC_API_KEY\` to \`server/.env\`
- Restart the server`,
};

export const mockProvider = {
  id: 'mock',
  model: 'demo',

  async *streamReply({ tone, messages, signal }) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const build = replies[tone] ?? replies.professional;
    const text = build(typeof lastUser?.content === 'string' ? lastUser.content : '');

    // Simulate "thinking", then stream in small, irregular chunks like a real model.
    await sleep(500, signal);
    const chunks = text.match(/\S+\s*|\s+/g) ?? [];
    for (const chunk of chunks) {
      await sleep(18 + Math.random() * 40, signal);
      yield { type: 'text', text: chunk };
    }

    yield { type: 'done', model: 'demo', stopReason: 'end_turn' };
  },
};
