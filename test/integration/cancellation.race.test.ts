import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db/pool.js';
import { cancelEvent } from '../../src/modules/cancellation/index.js';
import { getEvent } from '../../src/modules/events/index.js';
import { getGateway, processDuePayments, purchaseTicket, setGateway } from '../../src/modules/sales/index.js';
import { immediateGateway, ticketStatuses } from '../helpers/cancellation.js';
import { resetDb } from '../helpers/db.js';
import { CARD, insertEvent } from '../helpers/sales.js';

const ORG_A_ID = 'usr_seed_org_a';
const ROUNDS = 50;
const realGateway = getGateway();

beforeAll(async () => {
  await resetDb();
});
afterEach(() => {
  setGateway(realGateway);
});
afterAll(async () => {
  await closePool();
});

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('F07 — corrida cancelamento x gateway (R11, ADR-006, ADR-007)', () => {
  it(`C3/AC-F07-3: corrida cancelamento x gateway (${ROUNDS}×): nunca há confirmado em evento cancelado`, async () => {
    setGateway(immediateGateway);
    let sawWorkerFirst = 0;
    let sawCancelFirst = 0;

    for (let round = 0; round < ROUNDS; round++) {
      const eventId = await insertEvent({ capacity: 20 });

      // Dois já confirmados antes da corrida.
      for (let i = 0; i < 2; i++) {
        const r = await purchaseTicket({ eventId, channel: 'partner', buyerEmail: 'a@example.com', cardNumber: CARD.approvedFast });
        expect(r.ok).toBe(true);
      }
      await processDuePayments();

      // Pendentes com resposta do gateway já vencida (respond_at imediato): aprovados e recusados.
      const cards = [CARD.approvedFast, CARD.approvedSlow, CARD.declinedFast, CARD.approvedFast, CARD.declinedSlow, CARD.approvedFast];
      for (const cardNumber of cards) {
        const r = await purchaseTicket({ eventId, channel: 'partner', buyerEmail: 'b@example.com', cardNumber });
        expect(r.ok).toBe(true);
      }
      const before = await ticketStatuses(eventId);
      const confirmedBefore = Object.keys(before).filter((id) => before[id] === 'confirmed');

      // Worker (duas instâncias) e cancelamento disparados ao mesmo tempo, com defasagem variável.
      const jitter = round % 3;
      const [, , result] = await Promise.all([
        processDuePayments(),
        processDuePayments(),
        pause(jitter).then(() => cancelEvent(ORG_A_ID, eventId)),
      ]);
      // Drena qualquer resposta que tenha ficado para depois do cancelamento.
      await processDuePayments();

      const event = (await getEvent(eventId))!;
      expect(event.status).toBe('cancelled');

      const after = await ticketStatuses(eventId);
      const statuses = Object.values(after);
      expect(statuses).not.toContain('confirmed');
      expect(statuses).not.toContain('pending');
      for (const s of statuses) expect(['refunded', 'cancelled', 'declined']).toContain(s);
      for (const id of confirmedBefore) expect(after[id]).toBe('refunded');

      // Cada ingresso tem um destino coerente com o que o worker aplicou antes do cancelamento.
      const { rows: attempts } = await getPool().query<{ ticket_id: string; outcome: string; applied: boolean | null }>(
        `SELECT p.ticket_id, p.outcome, p.applied FROM payment_attempts p
           JOIN tickets t ON t.id = p.ticket_id WHERE t.event_id = $1`,
        [eventId],
      );
      for (const att of attempts) {
        expect(att.applied).not.toBeNull(); // toda resposta foi processada
        const expected = !att.applied ? 'cancelled' : att.outcome === 'approved' ? 'refunded' : 'declined';
        expect(after[att.ticket_id]).toBe(expected);
      }
      expect(result.refunded).toBe(statuses.filter((s) => s === 'refunded').length);
      expect(result.cancelled).toBe(statuses.filter((s) => s === 'cancelled').length);

      if (result.cancelled === cards.length) sawCancelFirst++;
      else sawWorkerFirst++;
    }

    // Sanidade: a soma cobre todas as rodadas (a distribuição depende do agendamento).
    expect(sawWorkerFirst + sawCancelFirst).toBe(ROUNDS);
  }, 120_000);
});
