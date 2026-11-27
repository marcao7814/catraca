// API pública do módulo de eventos (F02), consumida por F03–F08.
export {
  countOccupiedSeats,
  getEvent,
  listOrganizerEvents,
  listSellableEvents,
  loadOwnedEvent,
  lockEvent,
  lockOwnedEvent,
  toEvent,
} from './events.service.js';
export { renderManagementPage } from './management-page.js';
export { managementSlots, type SlotContext, type SlotName } from './management-slots.js';
export { sendEventNotFound, withOwnedEvent } from './routes.js';
export { STATUS_LABEL, type Event, type EventStatus } from './types.js';
