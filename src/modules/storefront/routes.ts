import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getPool } from '../../db/pool.js';
import { render } from '../../lib/render.js';
import { requireRole } from '../auth/guards.js';
import { setSessionCookie } from '../auth/routes.js';
import { createSession } from '../auth/sessions.js';
import { createUser } from '../auth/users.js';
import { getEvent, listSellableEvents, sendEventNotFound, type Event } from '../events/index.js';
import { getSeatStats, listTicketsByUser, purchaseTicket, TICKET_STATUS_LABEL } from '../sales/index.js';
import { normalizeCardNumber, validateSignup, type SignupValues } from './validation.js';

/** Texto exato do brief (R07). */
export const SOLD_OUT_MESSAGE = 'Ingressos esgotados';
export const INVALID_CARD_MESSAGE = 'Número de cartão inválido (16 dígitos)';

/** Evento à venda (R02) ou null. */
async function getSellableEvent(id: string): Promise<Event | null> {
  const event = await getEvent(id);
  return event && event.status === 'published' ? event : null;
}

async function renderEventPage(
  req: FastifyRequest,
  reply: FastifyReply,
  event: Event,
  opts: { error?: string | null; soldOut?: boolean } = {},
) {
  const available = (await getSeatStats(event.id))?.available ?? 0;
  return render(req, reply, 'storefront/event.ejs', {
    title: event.name,
    event,
    soldOut: opts.soldOut === true || available === 0,
    available,
    error: opts.error ?? null,
    soldOutMessage: SOLD_OUT_MESSAGE,
  });
}

function renderSignup(req: FastifyRequest, reply: FastifyReply, values: SignupValues, error: string | null) {
  return render(req, reply, 'storefront/signup.ejs', { title: 'Criar conta', values, error });
}

/** Rotas da vitrine e da área do participante (F03). */
export async function storefrontRoutes(app: FastifyInstance): Promise<void> {
  // Vitrine (R02): só eventos publicados e não cancelados.
  app.get('/', async (req, reply) => {
    const events = await listSellableEvents();
    const items = await Promise.all(
      events.map(async (event) => ({ event, available: (await getSeatStats(event.id))?.available ?? 0 })),
    );
    return render(req, reply, 'storefront/home.ejs', { title: 'Eventos', items, soldOutMessage: SOLD_OUT_MESSAGE });
  });

  app.get('/events/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = await getSellableEvent(id);
    if (!event) return sendEventNotFound(req, reply);
    return renderEventPage(req, reply, event);
  });

  // Compra pela vitrine (R06, R07). A lotação é garantida dentro de purchaseTicket (lock do evento).
  app.post('/events/:id/purchase', { preHandler: requireRole('participant') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = req.user!;
    const event = await getSellableEvent(id);
    if (!event) return sendEventNotFound(req, reply);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await purchaseTicket({
      eventId: event.id,
      channel: 'storefront',
      buyerUserId: user.id,
      buyerEmail: user.email,
      cardNumber: normalizeCardNumber(body.cardNumber),
    });
    if (result.ok) return reply.redirect('/me/tickets', 302);
    switch (result.error) {
      case 'sold_out':
        return renderEventPage(req, reply.code(409), event, { soldOut: true });
      case 'invalid_request':
        return renderEventPage(req, reply.code(422), event, { error: INVALID_CARD_MESSAGE });
      case 'event_not_available':
        return sendEventNotFound(req, reply);
    }
  });

  app.get('/signup', async (req, reply) => {
    if (req.user) return reply.redirect('/', 302);
    return renderSignup(req, reply, { name: '', email: '' }, null);
  });

  // Cadastro: sempre participante; já entra logado.
  app.post('/signup', async (req, reply) => {
    const parsed = validateSignup((req.body ?? {}) as Record<string, unknown>);
    if (!parsed.ok) return renderSignup(req, reply.code(422), parsed.values, parsed.error);
    const user = await createUser(getPool(), { ...parsed.input, role: 'participant' });
    if (!user) return renderSignup(req, reply.code(422), parsed.values, 'e-mail já cadastrado');
    const sid = await createSession(getPool(), user.id);
    setSessionCookie(reply, sid);
    return reply.redirect('/me/tickets', 302);
  });

  // Meus ingressos (R09): só os do usuário logado.
  app.get('/me/tickets', { preHandler: requireRole('participant') }, async (req, reply) => {
    const tickets = await listTicketsByUser(req.user!.id);
    return render(req, reply, 'storefront/tickets.ejs', {
      title: 'Meus ingressos',
      tickets,
      statusLabel: TICKET_STATUS_LABEL,
    });
  });
}
