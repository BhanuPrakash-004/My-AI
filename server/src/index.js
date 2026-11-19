import { createApp } from './app.js';
import { config } from './config.js';
import { connectDatabase } from './db.js';
import { Conversation } from './models/Conversation.js';
import { createRegistry } from './services/ai/registry.js';

async function start() {
  const registry = createRegistry(config.connections, { claude: config.claude });

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

  const app = createApp({ registry, clientOrigin: config.clientOrigin });
  app.listen(config.port, () => {
    console.log(`[server] API listening on http://localhost:${config.port}`);
    for (const model of registry.list()) {
      if (model.demo) {
        console.log(`[server] ${model.connection}: demo mode (${model.demoReason}) Replies are samples.`);
      } else {
        console.log(`[server] ${model.connection}: ${model.providerLabel} model "${model.model}"`);
      }
    }
  });
}

start();
