# MyAi: AI Chat Assistant

MyAi is a full-stack AI chat app with real-time streaming replies, saved conversation history, and a **tone toggle** that changes how the AI answers. You can **edit what each tone means**, **compare two answers side by side**, **choose how hard the model thinks** for each message, and **branch** a conversation to explore another direction without losing the original.

It works with **Claude (Anthropic)** or **OpenAI**, plus any OpenAI-compatible server (OpenRouter, Groq, Ollama, LM Studio…). You pick the provider, base URL, API key and model in `server/.env`.

| Layer | Tech |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS v4, lucide icons |
| Backend | Node.js, Express 5, Server-Sent Events |
| Database | MongoDB with Mongoose |
| AI | `@anthropic-ai/sdk` (Claude) and `openai` (OpenAI / compatible) |
| Tests | Vitest, Supertest, Testing Library |

---

## Features

### Chat and streaming
- **Chat interface** with distinct bubbles: your messages on the right, AI replies on the left with an orange edge showing which tone wrote them.
- **Streaming view**: replies appear character by character as the model writes them, with a blinking caret. Press **Stop** at any time; the partial reply is kept.
- **Markdown** rendering with tables, lists and highlighted code blocks, each with a **Copy code** button. Each reply also has its own **Copy** button.
- A **Thinking** indicator appears before the first word arrives, and **Jump to latest** appears when you scroll up during a long reply.

### History sidebar
- Past chats grouped by **Today**, **Yesterday**, **Previous 7 days**, and so on.
- **Search** across titles and message text.
- **Rename** inline and **delete** with confirmation.
- Every chat has its own link (`#/c/<id>`), so a page reload reopens it.
- Branched chats are marked with a branch icon. The coloured dot shows the tone of the last reply.

### Tone toggle: Professional, Casual, Concise
- Pick a tone under the message box before you send. The backend adds it to the request as a **system instruction**, so the very next reply changes style, even mid-conversation.
- **Rewrite in another tone**: switch the tone and click **Rewrite as Casual** (or another tone) under the latest reply to get the same answer in the new style.

### ⭐ Editable tones (custom tone editor)
- Open **Tone settings** in the sidebar (or **Edit tones** on the start screen).
- Change the instruction behind **Professional**, **Casual** and **Concise**, for example *"Talk like a friendly pirate, but keep the facts straight."*
- A **live preview** shows the full system prompt the model will receive.
- Saved instructions are stored in **MongoDB** and used for every new reply in that tone, including both sides of a comparison.
- **Reset to default** restores the built-in text. Edited tones are labelled "edited".

### ⭐ Compare answers (tones or models)
- Click **Compare** in the message box to get **two answers side by side** for the next message.
  - **Compare tones**: same model, different tones (e.g. Professional vs Casual).
  - **Compare models**: different models from the same provider (`AI_MODELS`), or **Claude vs OpenAI** with a second provider (`COMPARE_*` settings).
- Answer **A** uses the model and tone you selected. You choose the model and tone for answer **B** in the compare bar.
- Both answers are generated **in parallel** and stream at the same time.
- Click **Keep answer A** or **Keep answer B**. The kept answer becomes part of the conversation, and the other stays one click away (**Show answer B**).
- If one side fails, you can still keep the other. The chat waits until you choose, so the model always knows which answer you went with.

### ⭐ Thinking level per message
- Choose **Fast**, **Balanced** or **Deep** for each prompt from the thinking menu next to the tone switch.
- Each level maps to the model's own reasoning setting:

  | Level | Claude `output_config.effort` | OpenAI `reasoning_effort` |
  | --- | --- | --- |
  | Fast | `low` | `low` |
  | Balanced (default) | `medium` | `medium` |
  | Deep | `high` | `high` |

- If a model doesn't support the setting (for example an older OpenAI model or a local server), MyAi retries once without it and remembers that for the model.
- The level used is shown under every reply.

### ⭐ Branch a conversation
- Click **Branch** under any reply to start a **new chat that contains everything up to that point**. Then take it in a different direction.
- The **original chat is never changed**. The branch shows **"Branched from …"** with a link back, and a **"New branch starts here"** divider.
- The original lists its branches under the message they started from (**Branched into …**).
- Branches are named automatically: `Trip plan (branch)`, `Trip plan (branch 2)`, …

### Models and providers
- **Claude or OpenAI**, configured with `AI_PROVIDER`, `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`.
- **Model picker** in the header when several models are configured.
- **Demo mode**: with no API key, MyAi streams sample replies so every feature can be tried right away.

### Design and usability
- **Black, white and orange** design, with **light and dark** themes (follows your system; toggle in the header).
- The three tones are three shades of orange: red-orange (Professional), orange (Casual) and amber (Concise).
- **Responsive**: the sidebar becomes a slide-out drawer on phones, and comparison cards stack.
- **Keyboard friendly**: Enter sends, Shift+Enter adds a new line, arrow keys move through the tone switch, and Escape closes menus and dialogs. Focus is visible everywhere and reduced-motion settings are respected.
- The welcome intro appears only on your first visit. After your first message, a new chat opens straight to the starter prompts.

---

## Setup

### 1. Prerequisites
- **Node.js 20 or newer**: `node -v`
- **MongoDB**, either running locally (default `mongodb://127.0.0.1:27017`) or a free **MongoDB Atlas** cluster
  - Windows: install MongoDB Community Server; it runs as the `MongoDB` service (`net start MongoDB`)
  - macOS: `brew services start mongodb-community`
- An API key from **Anthropic** (https://platform.claude.com/settings/keys) or **OpenAI** (https://platform.openai.com/api-keys). This is optional; without one the app runs in demo mode.

### 2. Install
```bash
git clone <your-repo-url> myai
cd myai
npm install          # installs the root, server and client packages
```

### 3. Configure `server/.env`
```bash
cp server/.env.example server/.env
```
Then open `server/.env` and set your provider. Pick **one** of these:

**Claude**
```env
AI_PROVIDER=claude
AI_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5-5
```

**OpenAI**
```env
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-5-mini
```

**OpenRouter** (or any OpenAI-compatible API)
```env
AI_PROVIDER=openai
AI_BASE_URL=https://openrouter.ai/api/v1
AI_API_KEY=sk-or-...
AI_MODEL=openai/gpt-5-mini
```

**Ollama** (local, no key needed)
```env
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
```

**Optional: more models for the picker and Compare**
```env
AI_MODELS=claude-sonnet-5-5,claude-haiku-5-5
```

**Optional: compare Claude against OpenAI side by side**
```env
AI_PROVIDER=claude
AI_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5-5

COMPARE_PROVIDER=openai
COMPARE_API_KEY=sk-...
COMPARE_MODEL=gpt-5-mini
```

### 4. Run
```bash
npm run dev
```
This starts the API on http://localhost:5000 and the web app on **http://localhost:5173**. Open the web app in your browser.

The server log shows which provider and model are active, or that it is running in demo mode.

### 5. Production build (optional)
```bash
npm run build   # builds client/dist
npm start       # Express serves the API and the built app on http://localhost:5000
```

---

## Configuration reference (`server/.env`)

Variables already set in your shell or hosting platform take priority over the file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | API port |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/Ai_Chat` | MongoDB connection string |
| `AI_PROVIDER` | `claude` | `claude` or `openai` (`mock` forces demo mode) |
| `AI_API_KEY` | (empty) | Provider API key. Empty means demo mode. Falls back to `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. |
| `AI_BASE_URL` | provider default | Custom endpoint: OpenAI-compatible servers, proxies, gateways |
| `AI_MODEL` | `claude-opus-5-5` / `gpt-5-mini` | Main model |
| `AI_MODELS` | (empty) | Extra comma-separated models from the same provider |
| `COMPARE_PROVIDER`, `COMPARE_API_KEY`, `COMPARE_BASE_URL`, `COMPARE_MODEL`, `COMPARE_MODELS` | (empty) | Optional second provider, used for the model picker and Compare |
| `AI_MAX_TOKENS` | `64000` | Claude: max output tokens per reply |
| `AI_FALLBACKS` | `true` | Claude: if a safety classifier declines, retry on a fallback model in the same stream |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin in development |

---

## How the tone reaches the model

`server/src/services/tones.js` builds the system prompt for every request. The instruction comes from the tone editor (MongoDB) or the built-in default:

```
You are MyAi, a helpful AI assistant inside a chat app. …

<tone_instruction>
Tone: Concise.
Give the shortest answer that fully addresses the question. …
Apply this tone to your next reply even if earlier replies in this conversation used a different tone.
</tone_instruction>
```

When comparing, each side gets the system prompt for its own tone.

---

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Server and database status, configured models, tones and thinking levels |
| `POST` | `/api/chat` | Send a message (SSE stream). See below. |
| `GET` | `/api/conversations?q=` | List chats, newest first, with optional search |
| `GET` | `/api/conversations/:id` | One chat, with its branches and branch origin |
| `PATCH` | `/api/conversations/:id` | Rename (`{ title }`) or set tone (`{ tone }`) |
| `DELETE` | `/api/conversations/:id` | Delete a chat |
| `POST` | `/api/conversations/:id/branch` | Branch from `{ exchangeId }` into a new chat |
| `POST` | `/api/conversations/:id/exchanges/:exchangeId/select` | Keep compared answer `{ candidate: 0 \| 1 }` |
| `GET` | `/api/tones` | The instruction behind each tone and the system prompt it produces |
| `PUT` | `/api/tones/:id` | Save a custom instruction `{ instruction }` |
| `DELETE` | `/api/tones/:id` | Reset a tone to its default |

**`POST /api/chat` body**
```json
{
  "message": "Which database should I use?",
  "tone": "professional",
  "thinking": "deep",
  "modelId": "primary:claude-opus-5-5",
  "compare": { "modelId": "compare:gpt-5-mini", "tone": "casual" },
  "conversationId": "optional, to continue a chat",
  "regenerateExchangeId": "optional, to rewrite the latest reply"
}
```

**Stream events:** `meta` (ids), `delta` (`{ text }`, or `{ candidate, text }` when comparing), `candidate` (one side finished), then `done` or `error`. If the browser disconnects (Stop), the server cancels the AI request and saves the partial reply with status `stopped`.

### Data model
```js
Conversation {
  title, tone, createdAt, updatedAt,
  branchedFrom?: { conversationId, exchangeId, title, copiedCount },
  exchanges: [{
    prompt,            // user prompt
    response,          // AI response
    tone,              // professional | casual | concise
    thinking,          // fast | balanced | deep
    timestamp,         // when the prompt was sent
    completedAt,       // when the reply finished
    status,            // streaming | complete | stopped | error | choosing
    mode,              // single | compare
    candidates?: [{ label, modelId, model, tone, response, status, error }],
    selectedCandidate, // which compared answer was kept
    modelId, provider, model, stopReason, error
  }]
}

ToneSetting { _id: "casual", instruction, updatedAt }   // one per edited tone
```

---

## Testing

```bash
npm test               # server + client
npm test --prefix server
npm test --prefix client
```

- **Server (86 tests)**: config parsing for every provider setup, Claude and OpenAI adapters (parameters, thinking-level mapping, retry when a parameter is unsupported), error messages, and API tests for chat streaming, tones, compare, branching, history and stopping mid-stream.
  The API tests use a real MongoDB **test database** (`mongodb://127.0.0.1:27017/ai_chat_test`, which is dropped afterwards). To use another one, set `TEST_MONGODB_URI`. No API key is needed; the tests use scripted fake providers.
- **Client (53 tests)**: SSE parsing, API client, tone switch, thinking menu, composer (send, Stop, compare bar, blocked state), messages (compare cards, keeping an answer, branch links, errors), tone editor, the `useChat` state hook (streaming, compare, branching), and app rendering.
- **Smoke test** against a running server: `npm run smoke`.

---

## Project structure
```
├── package.json                 # root scripts: dev, build, start, test
├── server/
│   ├── .env.example
│   ├── src/
│   │   ├── index.js             # starts the server
│   │   ├── app.js               # Express app (routes, static files, errors)
│   │   ├── config.js            # reads AI_* / COMPARE_* settings
│   │   ├── models/              # Conversation, ToneSetting
│   │   ├── routes/              # chat (SSE + compare), conversations (branch, select), tones
│   │   ├── services/
│   │   │   ├── tones.js         # tone -> system instruction
│   │   │   ├── toneSettings.js  # custom instructions in MongoDB
│   │   │   ├── thinking.js      # Fast / Balanced / Deep mapping
│   │   │   └── ai/              # claude.js, openai.js, mock.js, registry.js
│   │   └── utils/
│   └── tests/                   # unit/ and api/ (Vitest + Supertest)
└── client/
    ├── index.html
    └── src/
        ├── App.jsx
        ├── components/          # Sidebar, ChatView, Message, Composer, ToneToggle,
        │                        # ThinkingPicker, CompareBar, ModelPicker, ToneEditor, …
        ├── hooks/               # useChat (state + streaming), useSmoothText, …
        ├── lib/                 # api client + SSE parser, tones, thinking levels
        └── test/                # test setup and fake server helpers
```

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Can't reach the server" | Run `npm run dev` and make sure port 5000 is free. |
| Server exits with a MongoDB error | Start MongoDB (`net start MongoDB` on Windows) or fix `MONGODB_URI`. |
| "… rejected the API key" | Check `AI_API_KEY` (and `AI_PROVIDER`) in `server/.env`, then restart the server. |
| "The model … was not found" | Check `AI_MODEL`, and `AI_BASE_URL` if you use a compatible server. |
| "Claude rejected the request" mentioning fallbacks | Set `AI_FALLBACKS=false`. |
| Compare only offers tones | Add `AI_MODELS` or a `COMPARE_PROVIDER` to compare models. |
| Still seeing demo replies | `AI_API_KEY` is empty or the server wasn't restarted after editing `.env`. |
