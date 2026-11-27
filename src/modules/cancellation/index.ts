// API pública do módulo de cancelamento (F07), consumida por F06 e F08.
export {
  CancellationError,
  cancelEvent,
  type CancellationErrorCode,
  type CancellationResult,
} from './cancellation.service.js';
export { cancellationRoutes } from './routes.js';
