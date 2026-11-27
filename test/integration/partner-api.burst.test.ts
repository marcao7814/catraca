import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { resetDb } from '../helpers/db.js';
import { buyFetch, countStatuses, getJson } from '../helpers/partner.js';
import { CARD, insertEvent, overbookedEvents } from '../helpers/sales.js';

// Rajada por HTTP real (servidor ouvindo em porta efêmera, fetch em paralelo), como o passo 15
// do fluxo do avaliador. Repetida em várias rodadas, cada uma em evento novo: um teste de
// concorrência que passa uma vez não prova nada.
const ROUNDS = 10;
const REQUESTS = 30;
const CAPACITY = 5;

let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  await resetDb();
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  await closePool();
});

describe('F05 — rajada HTTP (R07)', () => {
  it(`C12/AC-F05-6: ${REQUESTS} compras simultâneas em evento novo de lotação ${CAPACITY} → exatamente 5×202 e 25×409, em ${ROUNDS} rodadas`, async () => {
    for (let round = 1; round <= ROUNDS; round++) {
      const eventId = await insertEvent({ capacity: CAPACITY, priceCents: 1000 });
      const results = await Promise.all(
        Array.from({ length: REQUESTS }, (_, i) =>
          buyFetch(base, eventId, { buyerEmail: `carga${i}@example.com`, cardNumber: CARD.approvedFast }),
        ),
      );
      expect(countStatuses(results.map((r) => r.status)), `rodada ${round}`).toStrictEqual({ 202: 5, 409: 25 });
      for (const r of results) {
        if (r.status === 409) expect(r.body).toStrictEqual({ error: 'sold_out' });
        else expect(r.body).toMatchObject({ status: 'pending' });
      }
      const { rows } = await getPool().query<{ n: number }>(
        "SELECT count(*) AS n FROM tickets WHERE event_id = $1 AND status IN ('pending', 'confirmed')",
        [eventId],
      );
      expect(rows[0]!.n, `rodada ${round}`).toBe(CAPACITY);
      const list = (await getJson(base, '/api/partner/events')).body as Array<{ id: string; availableSeats: number }>;
      expect(list.find((e) => e.id === eventId)?.availableSeats).toBe(0);
    }
    expect(await overbookedEvents()).toStrictEqual([]);
  }, 120_000);
});
