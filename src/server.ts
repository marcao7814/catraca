import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';
import { onShutdown, runShutdown } from './lib/lifecycle.js';
import { startGatewayWorker } from './modules/sales/index.js';

const app = await buildApp({ logger: true });

// Worker que aplica as respostas do gateway simulado (F04, ADR-005).
onShutdown(startGatewayWorker(config.workerIntervalMs, app.log));

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
app.log.info({ gatewayDelayScale: config.gatewayDelayScale }, 'worker do gateway iniciado');
