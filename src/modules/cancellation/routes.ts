import type { FastifyInstance } from 'fastify';
import { requireRole } from '../auth/guards.js';
import {
  loadOwnedEvent,
  managementSlots,
  renderManagementPage,
  sendEventNotFound,
  withOwnedEvent,
  type SlotContext,
} from '../events/index.js';
import { CancellationError, cancelEvent } from './cancellation.service.js';

const errorStatus: Record<CancellationError['code'], number> = {
  not_found: 404,
  not_cancellable: 409,
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Slot `cancel` da página de gestão (P-F07-3): botão só para evento publicado. */
export async function renderCancelSlot({ req, event }: SlotContext): Promise<string> {
  if (event.status === 'published') {
    return (
      `<h2>Cancelar evento</h2>` +
      `<p>O cancelamento é irreversível: ingressos confirmados são estornados e pendentes são cancelados.</p>` +
      `<form method="post" action="/organizer/events/${escapeHtml(event.id)}/cancel" id="cancel-form"` +
      ` onsubmit="return confirm('Cancelar este evento? Esta ação não pode ser desfeita.');">` +
      `<button type="submit">Cancelar evento</button></form>`
    );
  }
  const { cancelled } = (req.query ?? {}) as { cancelled?: string };
  if (event.status === 'cancelled' && cancelled) {
    return (
      `<p class="notice" role="status" id="cancel-notice">Evento cancelado. ` +
      `Ingressos confirmados foram estornados e pendentes foram cancelados.</p>`
    );
  }
  return '';
}

export async function cancellationRoutes(app: FastifyInstance): Promise<void> {
  managementSlots.register('cancel', renderCancelSlot);

  app.post('/organizer/events/:id/cancel', { preHandler: requireRole('organizer') }, async (req, reply) => {
    const event = await withOwnedEvent(req, reply);
    if (!event) return reply;
    try {
      await cancelEvent(req.user!.id, event.id);
    } catch (err) {
      if (!(err instanceof CancellationError)) throw err;
      if (err.code === 'not_found') return sendEventNotFound(req, reply);
      const fresh = (await loadOwnedEvent(req.user!.id, event.id)) ?? event;
      return renderManagementPage(req, reply.code(errorStatus[err.code]), fresh, { error: err.message });
    }
    return reply.redirect(`/organizer/events/${event.id}?cancelled=1`, 302);
  });
}
