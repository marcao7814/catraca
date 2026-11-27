// Worker do gateway (ADR-005): de tempos em tempos aplica as respostas vencidas.
// Persistido no banco, então sobrevive a reinício do app (NFR-5).
import { config } from '../../config.js';
import { processDuePayments } from './sales.service.js';

export interface WorkerLogger {
  error: (obj: unknown, msg?: string) => void;
}

/** Inicia o worker e devolve a função de parada (aguarda o ciclo em andamento terminar). */
export function startGatewayWorker(
  intervalMs: number = config.workerIntervalMs,
  log: WorkerLogger = console,
): () => Promise<void> {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();

  const tick = async () => {
    try {
      // Drena tudo que venceu antes de dormir de novo.
      while (!stopped && (await processDuePayments()) > 0) {
        /* continua */
      }
    } catch (err) {
      log.error({ err }, 'worker do gateway falhou neste ciclo');
    }
  };

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = tick().finally(schedule);
    }, intervalMs);
  };
  schedule();

  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await running;
  };
}
