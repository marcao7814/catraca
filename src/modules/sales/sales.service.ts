import type pg from 'pg';
import { getPool, type Db } from '../../db/pool.js';
import { withTx } from '../../db/tx.js';
import { newId, newTicketCode, normalizeTicketCode } from '../../lib/ids.js';
import { countOccupiedSeats, getEvent, lockEvent } from '../events/index.js';
import { getGateway } from './gateway.js';
import type { GatewayOutcome, PurchaseInput, PurchaseResult, SeatStats, Ticket } from './types.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CARD_RE = /^\d{16}$/;

interface TicketRow {
  id: string;
  event_id: string;
  code: string;
  channel: Ticket['channel'];
  buyer_user_id: string | null;
  buyer_email: string;
  price_paid_cents: number;
  status: Ticket['status'];
  checked_in_at: Date | null;
  created_at: Date;
}

const COLUMNS =
  'id, event_id, code, channel, buyer_user_id, buyer_email, price_paid_cents, status, checked_in_at, created_at';

function toTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    eventId: r.event_id,
    code: r.code,
    channel: r.channel,
    buyerUserId: r.buyer_user_id,
    buyerEmail: r.buyer_email,
    pricePaidCents: r.price_paid_cents,
    status: r.status,
    checkedInAt: r.checked_in_at,
    createdAt: r.created_at,
  };
}

async function insertTicketWithUniqueCode(
  client: pg.PoolClient,
  values: { eventId: string; channel: string; buyerUserId: string | null; buyerEmail: string; priceCents: number },
): Promise<Ticket> {
  // Colisão de código é improvável (32^8); em caso de colisão, tenta de novo dentro de um savepoint.
  for (let attempt = 0; attempt < 5; attempt++) {
    await client.query('SAVEPOINT ticket_code');
    try {
      const { rows } = await client.query<TicketRow>(
        `INSERT INTO tickets (id, event_id, code, channel, buyer_user_id, buyer_email, price_paid_cents, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING ${COLUMNS}`,
        [
          newId('tkt'),
          values.eventId,
          newTicketCode(),
          values.channel,
          values.buyerUserId,
          values.buyerEmail,
          values.priceCents,
        ],
      );
      await client.query('RELEASE SAVEPOINT ticket_code');
      return toTicket(rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT ticket_code');
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'tickets_code_key') continue;
      throw err;
    }
  }
  throw new Error('não foi possível gerar um código de ingresso único');
}

/**
 * Compra de um ingresso (R06, R07). Responde sem esperar o gateway.
 *
 * Garantia de lotação (ADR-004): a linha do evento é travada com FOR UPDATE e as vagas
 * ocupadas são contadas na MESMA transação que insere o ingresso. Compras concorrentes do
 * mesmo evento ficam em fila no lock, então nunca há duas vendo a mesma vaga livre.
 */
export async function purchaseTicket(input: PurchaseInput): Promise<PurchaseResult> {
  const buyerEmail = typeof input.buyerEmail === 'string' ? input.buyerEmail.trim().toLowerCase() : '';
  const cardNumber = typeof input.cardNumber === 'string' ? input.cardNumber : '';
  if (!EMAIL_RE.test(buyerEmail) || !CARD_RE.test(cardNumber)) return { ok: false, error: 'invalid_request' };

  return withTx(async (client) => {
    const event = await lockEvent(client, input.eventId);
    if (!event || event.status !== 'published') return { ok: false, error: 'event_not_available' } as const;

    const occupied = await countOccupiedSeats(client, event.id);
    if (occupied >= event.capacity) return { ok: false, error: 'sold_out' } as const;

    const auth = getGateway().authorize(cardNumber);
    const ticket = await insertTicketWithUniqueCode(client, {
      eventId: event.id,
      channel: input.channel,
      buyerUserId: input.buyerUserId ?? null,
      buyerEmail,
      priceCents: event.priceCents, // preço vigente no instante da compra (R03)
    });
    // Só os 4 últimos dígitos do cartão são guardados.
    await client.query(
      `INSERT INTO payment_attempts (ticket_id, card_last4, outcome, respond_at)
       VALUES ($1, $2, $3, clock_timestamp() + make_interval(secs => $4::double precision / 1000))`,
      [ticket.id, cardNumber.slice(-4), auth.outcome, auth.delayMs],
    );
    return { ok: true, ticket } as const;
  });
}

/** R05: ocupadas = pendentes + confirmados; disponíveis = lotação − ocupadas; cancelado = 0. */
export async function getSeatStats(eventId: string, db: Db = getPool()): Promise<SeatStats | null> {
  const event = await getEvent(eventId, db);
  if (!event) return null;
  const occupied = await countOccupiedSeats(db, eventId);
  const available = event.status === 'cancelled' ? 0 : Math.max(0, event.capacity - occupied);
  return { capacity: event.capacity, occupied, available };
}

export async function getTicket(ticketId: string, db: Db = getPool()): Promise<Ticket | null> {
  const { rows } = await db.query<TicketRow>(`SELECT ${COLUMNS} FROM tickets WHERE id = $1`, [ticketId]);
  return rows[0] ? toTicket(rows[0]) : null;
}

/** Busca um ingresso pelo código, sempre dentro do evento (código de outro evento = inexistente). */
export async function findTicketByCode(eventId: string, rawCode: string, db: Db = getPool()): Promise<Ticket | null> {
  const { rows } = await db.query<TicketRow>(`SELECT ${COLUMNS} FROM tickets WHERE event_id = $1 AND code = $2`, [
    eventId,
    normalizeTicketCode(rawCode),
  ]);
  return rows[0] ? toTicket(rows[0]) : null;
}

export interface UserTicket extends Ticket {
  eventName: string;
  eventStartsAt: Date;
}

export async function listTicketsByUser(userId: string, db: Db = getPool()): Promise<UserTicket[]> {
  const { rows } = await db.query<TicketRow & { event_name: string; event_starts_at: Date }>(
    `SELECT ${COLUMNS.split(', ')
      .map((c) => `t.${c}`)
      .join(', ')}, e.name AS event_name, e.starts_at AS event_starts_at
       FROM tickets t JOIN events e ON e.id = t.event_id
      WHERE t.buyer_user_id = $1
      ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({ ...toTicket(r), eventName: r.event_name, eventStartsAt: r.event_starts_at }));
}

/**
 * Aplica a resposta do gateway (R08). Só altera ingresso que ainda está pendente (ADR-006):
 * se o evento foi cancelado antes, a resposta tardia vira no-op (R11). Retorna se aplicou.
 */
export async function applyGatewayResult(ticketId: string, outcome: GatewayOutcome): Promise<boolean> {
  return withTx(async (client) => {
    const ticket = await getTicket(ticketId, client);
    if (!ticket) return false;
    await lockEvent(client, ticket.eventId);
    return applyLocked(client, ticketId, outcome);
  });
}

async function applyLocked(client: pg.PoolClient, ticketId: string, outcome: GatewayOutcome): Promise<boolean> {
  const to = outcome === 'approved' ? 'confirmed' : 'declined';
  const res = await client.query(`UPDATE tickets SET status = $2 WHERE id = $1 AND status = 'pending'`, [
    ticketId,
    to,
  ]);
  return res.rowCount === 1;
}

/**
 * Processa as respostas do gateway que já venceram. Cada uma em transação própria, travando
 * primeiro o evento e depois a tentativa (mesma ordem da compra e do cancelamento: sem deadlock).
 * SKIP LOCKED permite mais de um worker sem processar a mesma tentativa duas vezes.
 */
export async function processDuePayments(limit = 50): Promise<number> {
  const { rows: due } = await getPool().query<{ ticket_id: string; event_id: string }>(
    `SELECT p.ticket_id, t.event_id
       FROM payment_attempts p JOIN tickets t ON t.id = p.ticket_id
      WHERE p.processed_at IS NULL AND p.respond_at <= clock_timestamp()
      ORDER BY p.respond_at
      LIMIT $1`,
    [limit],
  );
  let processed = 0;
  for (const { ticket_id, event_id } of due) {
    const done = await withTx(async (client) => {
      await lockEvent(client, event_id);
      const { rows } = await client.query<{ outcome: GatewayOutcome }>(
        `SELECT outcome FROM payment_attempts
          WHERE ticket_id = $1 AND processed_at IS NULL
          FOR UPDATE SKIP LOCKED`,
        [ticket_id],
      );
      const attempt = rows[0];
      if (!attempt) return false;
      const applied = await applyLocked(client, ticket_id, attempt.outcome);
      await client.query(
        `UPDATE payment_attempts SET processed_at = clock_timestamp(), applied = $2 WHERE ticket_id = $1`,
        [ticket_id, applied],
      );
      return true;
    });
    if (done) processed++;
  }
  return processed;
}
