// API pública do motor de vendas (F04), consumida por F03, F05, F06, F07 e F08.
export { getGateway, ruleFor, setGateway, SimulatedGateway, type PaymentGateway } from './gateway.js';
export {
  applyGatewayResult,
  CARD_RE,
  EMAIL_RE,
  findTicketByCode,
  getSeatStats,
  getTicket,
  listTicketsByUser,
  processDuePayments,
  purchaseTicket,
  type UserTicket,
} from './sales.service.js';
export {
  TICKET_STATUS_LABEL,
  type PurchaseError,
  type PurchaseInput,
  type PurchaseResult,
  type SeatStats,
  type Ticket,
  type TicketStatus,
} from './types.js';
export { startGatewayWorker } from './worker.js';
