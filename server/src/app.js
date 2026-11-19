import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { databaseStatus } from './db.js';
import { createChatRouter } from './routes/chat.js';
import { createConversationsRouter } from './routes/conversations.js';
import { createTonesRouter } from './routes/tones.js';
import { DEFAULT_THINKING, THINKING_IDS, THINKING_LEVELS } from './services/thinking.js';
import { TONE_IDS, TONES } from './services/tones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Builds the Express app. `registry` decides which models are available. */
export function createApp({ registry, clientOrigin, serveClient = true, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  if (clientOrigin) app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => {
    const models = registry.list();
    res.json({
      status: 'ok',
      database: databaseStatus(),
      demo: registry.isDemo(),
      demoReason: models.find((m) => m.demo)?.demoReason ?? null,
      models,
      defaultModelId: models[0]?.id ?? null,
      // Kept for older clients: the primary model.
      provider: models[0]?.provider ?? null,
      model: models[0]?.model ?? null,
      tones: TONE_IDS.map((id) => ({ id, label: TONES[id].label })),
      thinkingLevels: THINKING_IDS.map((id) => ({ id, label: THINKING_LEVELS[id].label })),
      defaultThinking: DEFAULT_THINKING,
    });
  });

  app.use('/api/conversations', createConversationsRouter());
  app.use('/api/chat', createChatRouter({ registry, log }));
  app.use('/api/tones', createTonesRouter());
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // In production, serve the built React app from client/dist.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (serveClient && fs.existsSync(clientDist)) {
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
      log.error?.('[server]', err);
      message = 'Internal server error.';
    }

    if (res.headersSent) return res.end();
    res.status(status).json({ error: message });
  });

  return app;
}
