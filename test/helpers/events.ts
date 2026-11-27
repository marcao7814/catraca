import type { FastifyInstance } from 'fastify';
import { getPool } from '../../src/db/pool.js';
import { toLocalInput } from '../../src/lib/dates.js';
import { newId, newTicketCode } from '../../src/lib/ids.js';
import { form } from './http.js';

const DAY = 24 * 60 * 60 * 1000;

/** Valor de datetime-local daqui a N dias (negativo = passado). */
export function localInDays(days: number): string {
  return toLocalInput(new Date(Date.now() + days * DAY));
}

export interface EventFormInput {
  name?: string;
  startsAt?: string;
  venue?: string;
  capacity?: string;
  price?: string;
}

export function eventForm(over: EventFormInput = {}): Record<string, string> {
  return {
    name: 'Jazz no Porão',
    startsAt: localInDays(30),
    venue: 'Bar do Porão',
    capacity: '2',
    price: '100,00',
    ...over,
  } as Record<string, string>;
}

/** Cria um evento pela rota HTTP e devolve o id (extraído do redirect). */
export async function createEventHttp(app: FastifyInstance, cookie: string, over: EventFormInput = {}) {
  const f = form(eventForm(over));
  const res = await app.inject({
    method: 'POST',
    url: '/organizer/events/new',
    payload: f.payload,
    headers: { ...f.headers, cookie },
  });
  if (res.statusCode !== 302) throw new Error(`criação falhou: ${res.statusCode} ${res.body.slice(0, 300)}`);
  const id = /\/organizer\/events\/(evt_[a-z2-7]+)$/.exec(res.headers.location as string)?.[1];
  if (!id) throw new Error(`id não encontrado em ${res.headers.location}`);
  return id;
}

export async function publishHttp(app: FastifyInstance, cookie: string, id: string) {
  return app.inject({ method: 'POST', url: `/organizer/events/${id}/publish`, headers: { cookie } });
}

export async function editHttp(app: FastifyInstance, cookie: string, id: string, over: EventFormInput) {
  const f = form(eventForm(over));
  return app.inject({
    method: 'POST',
    url: `/organizer/events/${id}`,
    payload: f.payload,
    headers: { ...f.headers, cookie },
  });
}

/** Insere ingressos diretamente (F02 não depende de F04; simula vagas ocupadas). */
export async function insertTickets(
  eventId: string,
  status: 'pending' | 'confirmed' | 'declined' | 'refunded' | 'cancelled',
  count = 1,
  priceCents = 10000,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId('tkt');
    await getPool().query(
      `INSERT INTO tickets (id, event_id, code, channel, buyer_email, price_paid_cents, status)
       VALUES ($1, $2, $3, 'partner', 'teste@example.com', $4, $5)`,
      [id, eventId, newTicketCode(), priceCents, status],
    );
    ids.push(id);
  }
  return ids;
}
