import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { render } from '../../lib/render.js';
import { requireRole } from '../auth/guards.js';
import {
  createEvent,
  listOrganizerEvents,
  loadOwnedEvent,
  publishEvent,
  updateEvent,
} from './events.service.js';
import { renderManagementPage } from './management-page.js';
import { EventError, STATUS_LABEL, type Event } from './types.js';
import { validateEventForm } from './validation.js';

const EMPTY_FORM = { name: '', startsAt: '', venue: '', capacity: '', price: '' };

/** 404 genérico, idêntico para evento inexistente e evento de outro organizador (R13). */
export function sendEventNotFound(req: FastifyRequest, reply: FastifyReply) {
  return render(req, reply.code(404), 'error.ejs', {
    title: 'Não encontrado',
    message: 'Evento não encontrado.',
  });
}

/**
 * Carrega o evento do organizador logado ou responde 404.
 * Toda rota /organizer/events/:id* deve usar isto (inclusive as de F06, F07 e F08).
 */
export async function withOwnedEvent(req: FastifyRequest, reply: FastifyReply): Promise<Event | null> {
  const { id } = req.params as { id: string };
  const event = await loadOwnedEvent(req.user!.id, id);
  if (!event) {
    await sendEventNotFound(req, reply);
    return null;
  }
  return event;
}

const errorStatus: Record<EventError['code'], number> = {
  not_found: 404,
  capacity_below_occupied: 422,
  starts_in_past: 422,
  not_editable: 409,
  not_publishable: 409,
};

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  const organizerOnly = { preHandler: requireRole('organizer') };

  app.get('/organizer/events', organizerOnly, async (req, reply) => {
    const events = await listOrganizerEvents(req.user!.id);
    return render(req, reply, 'organizer/events.ejs', { title: 'Meus eventos', events, STATUS_LABEL });
  });

  app.get('/organizer/events/new', organizerOnly, async (req, reply) =>
    render(req, reply, 'organizer/new.ejs', { title: 'Novo evento', values: EMPTY_FORM, fieldErrors: {} }),
  );

  app.post('/organizer/events/new', organizerOnly, async (req, reply) => {
    const result = validateEventForm(req.body);
    if (!result.ok) {
      return render(req, reply.code(422), 'organizer/new.ejs', {
        title: 'Novo evento',
        values: result.values,
        fieldErrors: result.errors,
      });
    }
    const event = await createEvent(req.user!.id, result.value);
    return reply.redirect(`/organizer/events/${event.id}`, 302);
  });

  app.get('/organizer/events/:id', organizerOnly, async (req, reply) => {
    const event = await withOwnedEvent(req, reply);
    if (!event) return reply;
    const { saved, published } = req.query as { saved?: string; published?: string };
    const notice = saved ? 'Alterações salvas.' : published ? 'Evento publicado.' : null;
    return renderManagementPage(req, reply, event, { notice });
  });

  app.post('/organizer/events/:id', organizerOnly, async (req, reply) => {
    const event = await withOwnedEvent(req, reply);
    if (!event) return reply;
    if (event.status === 'cancelled') {
      return renderManagementPage(req, reply.code(409), event, { error: 'Evento cancelado não pode ser editado.' });
    }
    const result = validateEventForm(req.body);
    if (!result.ok) {
      return renderManagementPage(req, reply.code(422), event, {
        error: 'Corrija os campos destacados.',
        fieldErrors: result.errors,
        values: result.values,
      });
    }
    try {
      await updateEvent(req.user!.id, event.id, result.value);
    } catch (err) {
      if (!(err instanceof EventError)) throw err;
      if (err.code === 'not_found') return sendEventNotFound(req, reply);
      const fresh = (await loadOwnedEvent(req.user!.id, event.id)) ?? event;
      return renderManagementPage(req, reply.code(errorStatus[err.code]), fresh, {
        error: err.message,
        values: result.values,
      });
    }
    return reply.redirect(`/organizer/events/${event.id}?saved=1`, 302);
  });

  app.post('/organizer/events/:id/publish', organizerOnly, async (req, reply) => {
    const event = await withOwnedEvent(req, reply);
    if (!event) return reply;
    try {
      await publishEvent(req.user!.id, event.id);
    } catch (err) {
      if (!(err instanceof EventError)) throw err;
      if (err.code === 'not_found') return sendEventNotFound(req, reply);
      return renderManagementPage(req, reply.code(errorStatus[err.code]), event, { error: err.message });
    }
    return reply.redirect(`/organizer/events/${event.id}?published=1`, 302);
  });
}
