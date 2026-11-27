// R07 sob concorrência (AC-F04-4, ADR-004). Um teste que passa uma vez não prova nada:
// repete a rajada em vários eventos novos e confere o invariante no banco ao final.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db/pool.js';
import { getSeatStats, purchaseTicket } from '../../src/modules/sales/index.js';
import { updateEvent } from '../../src/modules/events/events.service.js';
import { getEvent } from '../../src/modules/events/index.js';
import { resetDb } from '../helpers/db.js';
import { CARD, insertEvent, overbookedEvents } from '../helpers/sales.js';

const ROUNDS = 20;
const BURST = 30;
const CAPACITY = 5;

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePool();
});

describe('F04 — lotação sob compras simultâneas (R07)', () => {
  it(`C4: ${ROUNDS} rodadas × ${BURST} compras simultâneas em evento de lotação ${CAPACITY} → exatamente ${CAPACITY} sucessos`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const eventId = await insertEvent({ capacity: CAPACITY });
      const results = await Promise.all(
        Array.from({ length: BURST }, (_, i) =>
          purchaseTicket({
            eventId,
            channel: 'partner',
            buyerEmail: `carga${i}@example.com`,
            cardNumber: CARD.approvedFast,
          }),
        ),
      );
      const ok = results.filter((r) => r.ok).length;
      const soldOut = results.filter((r) => !r.ok && r.error === 'sold_out').length;
      expect({ round, ok, soldOut }).toEqual({ round, ok: CAPACITY, soldOut: BURST - CAPACITY });
      expect((await getSeatStats(eventId))!.available).toBe(0);
    }
    expect(await overbookedEvents()).toEqual([]);
  });

  it('compras concorrentes com edição de lotação no meio nunca passam da lotação final', async () => {
    for (let round = 0; round < 5; round++) {
      const eventId = await insertEvent({ capacity: 3 });
      const e = (await getEvent(eventId))!;
      const input = { name: e.name, startsAt: e.startsAt, venue: e.venue, priceCents: e.priceCents };
      const ops: Promise<unknown>[] = Array.from({ length: 20 }, (_, i) =>
        purchaseTicket({ eventId, channel: 'partner', buyerEmail: `x${i}@example.com`, cardNumber: CARD.approvedSlow }),
      );
      ops.splice(10, 0, updateEvent('usr_seed_org_a', eventId, { ...input, capacity: 6 }).catch(() => null));
      await Promise.all(ops);
      const { rows } = await getPool().query<{ n: number; capacity: number }>(
        `SELECT count(t.*) AS n, e.capacity FROM events e
           LEFT JOIN tickets t ON t.event_id = e.id AND t.status IN ('pending','confirmed')
          WHERE e.id = $1 GROUP BY e.capacity`,
        [eventId],
      );
      expect(rows[0]!.n).toBeLessThanOrEqual(rows[0]!.capacity);
    }
    expect(await overbookedEvents()).toEqual([]);
  });
});
