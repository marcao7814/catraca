import type pg from 'pg';
import { getPool, type Db } from '../../db/pool.js';
import { withTx } from '../../db/tx.js';
import { newId } from '../../lib/ids.js';
import { EventError, type Event, type EventInput } from './types.js';

interface EventRow {
  id: string;
  organizer_id: string;
  name: string;
  starts_at: Date;
  venue: string;
  capacity: number;
  price_cents: number;
  status: Event['status'];
  published_at: Date | null;
  cancelled_at: Date | null;
}

const COLUMNS = 'id, organizer_id, name, starts_at, venue, capacity, price_cents, status, published_at, cancelled_at';

export function toEvent(r: EventRow): Event {
  return {
    id: r.id,
    organizerId: r.organizer_id,
    name: r.name,
    startsAt: r.starts_at,
    venue: r.venue,
    capacity: r.capacity,
    priceCents: r.price_cents,
    status: r.status,
    publishedAt: r.published_at,
    cancelledAt: r.cancelled_at,
  };
}

export async function createEvent(organizerId: string, input: EventInput, db: Db = getPool()): Promise<Event> {
  const { rows } = await db.query<EventRow>(
    `INSERT INTO events (id, organizer_id, name, starts_at, venue, capacity, price_cents, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
     RETURNING ${COLUMNS}`,
    [newId('evt'), organizerId, input.name, input.startsAt, input.venue, input.capacity, input.priceCents],
  );
  return toEvent(rows[0]!);
}

/** R13: o evento só é retornado se pertencer ao organizador. Senão, null (a rota responde 404). */
export async function loadOwnedEvent(organizerId: string, eventId: string, db: Db = getPool()): Promise<Event | null> {
  const { rows } = await db.query<EventRow>(`SELECT ${COLUMNS} FROM events WHERE id = $1 AND organizer_id = $2`, [
    eventId,
    organizerId,
  ]);
  return rows[0] ? toEvent(rows[0]) : null;
}

/**
 * Trava a linha do evento (ADR-004) dentro de uma transação já aberta, conferindo a posse.
 * Usado por toda operação que muda lotação, vagas ou estado do evento.
 */
export async function lockOwnedEvent(
  client: pg.PoolClient,
  organizerId: string,
  eventId: string,
): Promise<Event | null> {
  const { rows } = await client.query<EventRow>(
    `SELECT ${COLUMNS} FROM events WHERE id = $1 AND organizer_id = $2 FOR UPDATE`,
    [eventId, organizerId],
  );
  return rows[0] ? toEvent(rows[0]) : null;
}

/** Trava a linha do evento sem conferir posse (para canais de venda). */
export async function lockEvent(client: pg.PoolClient, eventId: string): Promise<Event | null> {
  const { rows } = await client.query<EventRow>(`SELECT ${COLUMNS} FROM events WHERE id = $1 FOR UPDATE`, [eventId]);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function getEvent(eventId: string, db: Db = getPool()): Promise<Event | null> {
  const { rows } = await db.query<EventRow>(`SELECT ${COLUMNS} FROM events WHERE id = $1`, [eventId]);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function listOrganizerEvents(organizerId: string, db: Db = getPool()): Promise<Event[]> {
  const { rows } = await db.query<EventRow>(
    `SELECT ${COLUMNS} FROM events WHERE organizer_id = $1 ORDER BY starts_at, created_at`,
    [organizerId],
  );
  return rows.map(toEvent);
}

/** R02: só evento publicado e não cancelado está à venda. */
export async function listSellableEvents(db: Db = getPool()): Promise<Event[]> {
  const { rows } = await db.query<EventRow>(
    `SELECT ${COLUMNS} FROM events WHERE status = 'published' ORDER BY starts_at, created_at`,
  );
  return rows.map(toEvent);
}

/** R05: vagas ocupadas = ingressos pendentes + confirmados. */
export async function countOccupiedSeats(db: Db, eventId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*) AS n FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')`,
    [eventId],
  );
  return rows[0]?.n ?? 0;
}

/** Edita o evento (R01, R03). Serializa com compras e cancelamento pelo lock do evento. */
export async function updateEvent(organizerId: string, eventId: string, input: EventInput): Promise<Event> {
  return withTx(async (client) => {
    const event = await lockOwnedEvent(client, organizerId, eventId);
    if (!event) throw new EventError('not_found', 'Evento não encontrado.');
    if (event.status === 'cancelled')
      throw new EventError('not_editable', 'Evento cancelado não pode ser editado.');
    if (input.startsAt.getTime() <= Date.now())
      throw new EventError('starts_in_past', 'A data de início precisa estar no futuro.');

    const occupied = await countOccupiedSeats(client, eventId);
    if (input.capacity < occupied)
      throw new EventError(
        'capacity_below_occupied',
        `A lotação não pode ser menor que as vagas ocupadas (${occupied}).`,
      );

    const { rows } = await client.query<EventRow>(
      `UPDATE events
          SET name = $2, starts_at = $3, venue = $4, capacity = $5, price_cents = $6, updated_at = now()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [eventId, input.name, input.startsAt, input.venue, input.capacity, input.priceCents],
    );
    return toEvent(rows[0]!);
  });
}

/** draft -> published (R02). */
export async function publishEvent(organizerId: string, eventId: string): Promise<Event> {
  return withTx(async (client) => {
    const event = await lockOwnedEvent(client, organizerId, eventId);
    if (!event) throw new EventError('not_found', 'Evento não encontrado.');
    if (event.status !== 'draft')
      throw new EventError('not_publishable', 'Só eventos em rascunho podem ser publicados.');
    if (event.startsAt.getTime() <= Date.now())
      throw new EventError('starts_in_past', 'A data de início precisa estar no futuro para publicar.');
    const { rows } = await client.query<EventRow>(
      `UPDATE events SET status = 'published', published_at = now(), updated_at = now()
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [eventId],
    );
    return toEvent(rows[0]!);
  });
}
