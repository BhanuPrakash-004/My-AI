# Timbre: AI Chat Assistant

A full-stack chat app with streaming replies, saved conversation history, and a **tone toggle** that changes how the AI answers (Professional, Casual, or Concise).

- **Frontend:** React 19, Vite, Tailwind CSS v4
- **Backend:** Node.js, Express 5, MongoDB (Mongoose)
- **AI:** Claude API through the official `@anthropic-ai/sdk` (model `claude-opus-5-5`)

## Features

| Requirement | How it works |
| --- | --- |
| Chat interface | Scrollable conversation with distinct bubbles: dark user bubbles on the right, AI bubbles on the left with a coloured edge showing the tone that produced them. Markdown, tables and highlighted code blocks with a copy button. |
| Streaming view | The server streams Claude's output as Server-Sent Events. The client reveals it character by character at a steady pace and speeds up when it falls behind. A caret blinks while streaming, and **Stop** cancels the request. |
| History sidebar | Past threads grouped by Today, Yesterday, Previous 7 days, and so on. Includes search across titles and message text, inline rename, delete with confirmation, and deep links (`#/c/<id>`) that survive a reload. |
| API integration | `server/src/services/ai/claude.js` calls `client.beta.messages.stream(...)` with the server-side refusal fallback enabled. |
| Persistence | Each conversation is one MongoDB document. Every exchange stores the **user prompt**, **AI response**, **tone**, **timestamp**, completion time, model and status. |
| Tone toggle | The selected tone is sent with every message. The backend appends it to the system prompt as a `<tone_instruction>` modifier. **Rewrite as …** re-answers the latest message in the newly selected tone. |

There is also a light and dark theme, a mobile drawer for the sidebar, keyboard support (Enter to send, Shift+Enter for a new line, arrow keys in the tone switch), and a **demo mode** that streams sample replies when no API key is configured.

## Quick start

Prerequisites: Node.js 20+ and MongoDB running locally (or a MongoDB Atlas URI).

```bash
# 1. Install everything (root, server and client)
npm install

# 2. Configure the server
cp server/.env.example server/.env
#    then edit server/.env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Run API (port 5000) and web app (port 5173) together
npm run dev
```

Open http://localhost:5173.

Without `ANTHROPIC_API_KEY` the app runs in **demo mode**. Everything works (streaming, saving, tone switching), but replies are samples. Add the key and restart the server for real answers.

### Production build

```bash
npm run build   # builds client/dist
npm start       # Express serves the API and the built app on http://localhost:5000
```

## Configuration (`server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (empty) | Claude API key. Empty means demo mode. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/timbre` | MongoDB connection string |
| `PORT` | `5000` | API port |
| `TIMBRE_MODEL` | `claude-opus-5-5` | Claude model ID |
| `TIMBRE_EFFORT` | `low` | `low`, `medium`, `high`, `xhigh` or `max`. Low keeps chat fast; raise it for harder questions. |
| `TIMBRE_MAX_TOKENS` | `64000` | Max output tokens per reply |
| `TIMBRE_FALLBACKS` | `true` | If Claude's safety classifier declines, the API retries on a fallback model in the same stream |
| `TIMBRE_PROVIDER` | auto | Force `claude` or `mock` |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin for development |

The app's own settings use a `TIMBRE_` prefix, so variables that other tools set in your shell (Claude Code sets `CLAUDE_EFFORT`, for example) can't change them.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Server, database and provider status |
| `GET` | `/api/conversations?q=` | List threads, newest first (optional search) |
| `GET` | `/api/conversations/:id` | One thread with all exchanges |
| `PATCH` | `/api/conversations/:id` | Rename (`{ title }`) or set tone (`{ tone }`) |
| `DELETE` | `/api/conversations/:id` | Delete a thread |
| `POST` | `/api/chat` | Send `{ message, tone, conversationId?, regenerateExchangeId? }`. Responds with an SSE stream of `meta`, `delta`…, then `done` or `error`. |

If the client disconnects mid-stream (the user pressed Stop), the server cancels the Claude request and saves the partial reply with status `stopped`.

### Data model

```js
Conversation {
  title, tone, createdAt, updatedAt,
  exchanges: [{
    prompt,        // user prompt
    response,      // AI response
    tone,          // professional | casual | concise
    timestamp,     // when the prompt was sent
    completedAt,   // when the reply finished
    status,        // streaming | complete | stopped | error
    model, stopReason, error
  }]
}
```

### How the tone reaches the model

`server/src/services/tones.js` builds the system prompt for every request:

```
You are Timbre, a helpful AI assistant inside a chat app. …

<tone_instruction>
Tone: Concise. Give the shortest answer that fully addresses the question. …
Apply this tone to your next reply even if earlier replies in this conversation used a different tone.
</tone_instruction>
```

Because the tone is applied per request, switching it changes the very next reply, even in the middle of a conversation.

## Testing

With the server running:

```bash
npm run smoke
```

This runs 22 end-to-end checks against the live API: validation, SSE event order, streamed text matching the saved text, MongoDB persistence, follow-ups, rewrite, search, rename, stop mid-stream, and delete.

## Project structure

```
├── package.json              # root scripts (dev, build, start, smoke)
├── server/
│   ├── .env.example
│   ├── scripts/smoke.js      # end-to-end API test
│   └── src/
│       ├── index.js          # Express app, static hosting, error handler
│       ├── config.js         # env parsing
│       ├── db.js             # MongoDB connection
│       ├── models/Conversation.js
│       ├── routes/           # chat (SSE), conversations (CRUD)
│       ├── services/tones.js # tone → system instruction
│       ├── services/ai/      # claude.js, mock.js (demo mode)
│       └── utils/            # SSE + HTTP helpers
└── client/
    ├── index.html
    └── src/
        ├── App.jsx
        ├── hooks/            # useChat (state + streaming), useSmoothText (typewriter), …
        ├── components/       # Sidebar, ChatView, Message, Composer, ToneToggle, Markdown, …
        └── lib/              # api client + SSE parser, tones, formatting
```

## Troubleshooting

- **"Can't reach the server"**: start the API with `npm run dev` and check that port 5000 is free.
- **Server exits with a MongoDB error**: start MongoDB (`net start MongoDB` on Windows) or set `MONGODB_URI`.
- **"The Anthropic API key was rejected"**: check `ANTHROPIC_API_KEY` in `server/.env`, then restart.
- **"Claude rejected the request" mentioning fallbacks**: set `TIMBRE_FALLBACKS=false`.
