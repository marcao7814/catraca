import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth/guards.js';
import {
  managementSlots,
  renderManagementPage,
  sendEventNotFound,
  withOwnedEvent,
  type SlotContext,
} from '../events/index.js';
import { CHECKIN_MESSAGES, CheckinError, checkIn, type CheckinResult } from './checkin.service.js';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Chave do resultado do check-in em `slotData`. */
const RESULT_KEY = 'checkinResult';

/**
 * Slot `checkin` da página de gestão (R10): campo "Código do ingresso" + botão. Em evento
 * cancelado, a mensagem "Evento cancelado" aparece no lugar do campo (o POST continua valendo).
 * Depois de um POST, a mensagem exata fica em `<p id="checkin-result">`.
 */
export async function renderCheckinSlot({ event, slotData }: SlotContext): Promise<string> {
  const result = slotData[RESULT_KEY] as CheckinResult | undefined;
  const resultHtml = result ? `<p id="checkin-result" role="status"><strong>${escapeHtml(result)}</strong></p>` : '';
  if (event.status === 'cancelled') {
    return `<h2>Check-in</h2>${resultHtml}<p id="checkin-closed"><strong>${CHECKIN_MESSAGES.eventCancelled}</strong></p>`;
  }
  return (
    `<h2>Check-in</h2>` +
    resultHtml +
    `<form method="post" action="/organizer/events/${escapeHtml(event.id)}/checkin" id="checkin-form">` +
    `<label for="checkin-code">Código do ingresso</label> ` +
    `<input id="checkin-code" name="code" autocomplete="off" autocapitalize="characters" required> ` +
    `<button type="submit">Fazer check-in</button></form>`
  );
}

export async function checkinRoutes(app: FastifyInstance): Promise<void> {
  managementSlots.register('checkin', renderCheckinSlot);

  app.post('/organizer/events/:id/checkin', { preHandler: requireRole('organizer') }, async (req, reply) => {
    const event = await withOwnedEvent(req, reply);
    if (!event) return reply;
    const body = (req.body ?? {}) as { code?: unknown };
    const code = typeof body.code === 'string' ? body.code : '';
    let result: CheckinResult;
    try {
      result = await checkIn(req.user!.id, event.id, code);
    } catch (err) {
      if (err instanceof CheckinError) return sendEventNotFound(req, reply);
      throw err;
    }
    return renderManagementPage(req, reply, event, { slotData: { [RESULT_KEY]: result } });
  });
}
