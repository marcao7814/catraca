import type { FastifyInstance } from 'fastify';
import { getPool } from '../../src/db/pool.js';
import type { PaymentGateway } from '../../src/modules/sales/index.js';
import { ruleFor } from '../../src/modules/sales/index.js';

export async function cancelHttp(app: FastifyInstance, cookie: string, id: string) {
  return app.inject({ method: 'POST', url: `/organizer/events/${id}/cancel`, headers: { cookie } });
}

/**
 * Gateway determinístico para os testes do cancelamento: resultado conforme a tabela do brief,
 * mas os cartões "rápidos" respondem na hora e os "lentos" só respondem quando o teste mandar
 * (ver `makeAttemptsDue`).
 */
export const instantFastGateway: PaymentGateway = {
  authorize(card) {
    const rule = ruleFor(card);
    return { outcome: rule.outcome, delayMs: rule.minMs >= 30_000 ? 3_600_000 : 0 };
  },
};

/** Gateway em que toda resposta já está vencida no momento da compra. */
export const immediateGateway: PaymentGateway = {
  authorize: (card) => ({ outcome: ruleFor(card).outcome, delayMs: 0 }),
};

/** Faz a resposta do gateway de um ingresso vencer agora (simula a "resposta tardia"). */
export async function makeAttemptsDue(ticketIds: string[]): Promise<void> {
  await getPool().query(`UPDATE payment_attempts SET respond_at = clock_timestamp() WHERE ticket_id = ANY($1)`, [
    ticketIds,
  ]);
}

export async function ticketStatuses(eventId: string): Promise<Record<string, string>> {
  const { rows } = await getPool().query<{ id: string; status: string }>(
    'SELECT id, status FROM tickets WHERE event_id = $1',
    [eventId],
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}
