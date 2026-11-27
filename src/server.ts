import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';
import { runShutdown } from './lib/lifecycle.js';

const app = await buildApp({ logger: true });

async function shutdown(signal: string) {
  app.log.info({ signal }, 'encerrando');
  await runShutdown();
  await app.close();
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: config.port });
