import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { connectDatabase, databaseStatus } from './db.js';
import { Conversation } from './models/Conversation.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter } from './routes/conversations.js';
import { providerInfo } from './services/ai/index.js';
import { TONE_IDS, TONES } from './services/tones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: databaseStatus(),
    ...providerInfo(),
    tones: TONE_IDS.map((id) => ({ id, label: TONES[id].label })),
  });
});

app.use('/api/conversations', conversationsRouter);
app.use('/api/chat', chatRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// In production, serve the built React app from client/dist.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status ?? err.statusCode ?? 500;
  let message = err.message;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body must be valid JSON.';
  } else if (err.name === 'ValidationError') {
    status = 400;
  } else if (status >= 500) {
    console.error('[server]', err);
    message = 'Internal server error.';
  }

  if (res.headersSent) return res.end();
  res.status(status).json({ error: message });
});

async function start() {
  try {
    await connectDatabase();
  } catch {
    process.exit(1);
  }

  // Replies interrupted by a server restart can never finish; mark them stopped.
  await Conversation.updateMany(
    { 'exchanges.status': 'streaming' },
    { $set: { 'exchanges.$[ex].status': 'stopped' } },
    { arrayFilters: [{ 'ex.status': 'streaming' }], timestamps: false },
  );

  app.listen(config.port, () => {
    const info = providerInfo();
    console.log(`[server] API listening on http://localhost:${config.port}`);
    if (info.demo) {
      console.log('[server] Demo mode: no ANTHROPIC_API_KEY found, replies are samples.');
    } else {
      console.log(`[server] Using Claude model ${info.model} (effort: ${config.claude.effort})`);
    }
  });
}

start();
