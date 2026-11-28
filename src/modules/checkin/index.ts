// API pública do módulo de check-in (F06), consumida por F08.
export {
  CHECKIN_MESSAGES,
  CheckinError,
  checkIn,
  decideCheckin,
  type CheckinResult,
} from './checkin.service.js';
export { checkinRoutes } from './routes.js';
