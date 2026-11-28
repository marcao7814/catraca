import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { closePool } from '../../src/db/pool.js';
import { startGatewayWorker } from '../../src/modules/sales/index.js';
import { cancelHttp } from '../helpers/cancellation.js';
import { expected, panel } from '../helpers/dashboard.js';
import { resetDb } from '../helpers/db.js';
import { createEventHttp, editHttp, publishHttp } from '../helpers/events.js';
import { loginAs, ORG_A, ORG_B } from '../helpers/http.js';
import { buyFetch, countStatuses, getJson } from '../helpers/partner.js';
import { CARD, waitFor } from '../helpers/sales.js';

// Painel nos passos 9, 14 e 15 do fluxo do avaliador (brief), pela página de gestão e pela API de
// parceiros em HTTP real, com o worker do gateway rodando (atrasos escalados nos gates).
let app: FastifyInstance;
let base: string;
let a: string;
let b: string;
let stopWorker: () => Promise<void>;

beforeAll(async () => {
  await resetDb();
  app = await buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  stopWorker = startGatewayWorker(10);
  a = await loginAs(app, ORG_A);
  b = await loginAs(app, ORG_B);
});
afterAll(async () => {
  await stopWorker();
  await app.close();
  await closePool();
});

const ticketStatus = async (id: string) =>
  ((await getJson(base, `/api/partner/tickets/${id}`)).body as { status: string }).status;

async function buyOk(eventId: string, cardNumber: string, buyerEmail: string): Promise<string> {
  const res = await buyFetch(base, eventId, { buyerEmail, cardNumber });
  expect(res.status).toBe(202);
  return (res.body as { ticketId: string }).ticketId;
}

describe('F08 — painel no fluxo do avaliador (E2E)', () => {
  it('C1/CX-F04-F08 passo 9: E1 com 2 confirmados a R$ 100, preço → R$ 150, lotação → 3, mais 1 confirmado e 1 recusado', async () => {
    const e1 = await createEventHttp(app, a, { name: 'E1', capacity: '2', price: '100,00' });
    expect((await publishHttp(app, a, e1)).statusCode).toBe(302);

    const t1 = await buyOk(e1, CARD.approvedFast, 't1@example.com');
    await waitFor(async () => (await ticketStatus(t1)) === 'confirmed', 10_000);
    const t2 = await buyOk(e1, CARD.declinedSlow, 't2@example.com');
    await waitFor(async () => (await ticketStatus(t2)) === 'declined', 10_000);
    const t3 = await buyOk(e1, CARD.approvedFast, 't3@example.com');
    await waitFor(async () => (await ticketStatus(t3)) === 'confirmed', 10_000);

    expect((await editHttp(app, a, e1, { name: 'E1', capacity: '1', price: '100,00' })).statusCode).toBe(422);
    expect((await editHttp(app, a, e1, { name: 'E1', capacity: '3', price: '150,00' })).statusCode).toBe(302);

    const t4 = await buyOk(e1, CARD.approvedFast, 't4@example.com');
    await waitFor(async () => (await ticketStatus(t4)) === 'confirmed', 10_000);

    const res = await panel(app, a, e1);
    expect(res.status).toBe(200);
    expect(res.metrics).toStrictEqual(
      expected({ confirmed: 3, pending: 0, checkins: 0, available: 0, revenue: 'R$ 350,00', refunded: 0 }),
    );

    // C7/CX-F02-F08: o mesmo endereço como organizador B não exibe nenhum número.
    const asB = await panel(app, b, e1);
    expect(asB.status).toBe(404);
    expect(asB.body).not.toContain('data-metric');
  });

  it('C4/CX-F07-F08 passos 12–14: E3 cancelado com 1 confirmado e 1 pendente', async () => {
    const e3 = await createEventHttp(app, a, { name: 'E3', capacity: '5', price: '50,00' });
    expect((await publishHttp(app, a, e3)).statusCode).toBe(302);

    const t6 = await buyOk(e3, CARD.approvedFast, 't6@example.com');
    await waitFor(async () => (await ticketStatus(t6)) === 'confirmed', 10_000);
    // Worker pausado: com atraso escalado, a resposta de 0003 (≈0,3 s) poderia chegar antes do
    // cancelamento; no ambiente real há 30–40 s de janela.
    await stopWorker();
    const t5 = await buyOk(e3, CARD.approvedSlow, 't5@example.com');
    expect((await panel(app, a, e3)).metrics).toStrictEqual(
      expected({ confirmed: 1, pending: 1, checkins: 0, available: 3, revenue: 'R$ 50,00', refunded: 0 }),
    );

    expect((await cancelHttp(app, a, e3)).statusCode).toBe(302);
    stopWorker = startGatewayWorker(10);
    // A resposta tardia (aprovada) de T5 é processada e ignorada.
    await new Promise((r) => setTimeout(r, 1_000));
    expect(await ticketStatus(t5)).toBe('cancelled');
    expect(await ticketStatus(t6)).toBe('refunded');

    const res = await panel(app, a, e3);
    expect(res.status).toBe(200);
    expect(res.metrics).toStrictEqual(
      expected({ confirmed: 0, pending: 0, checkins: 0, available: 0, revenue: 'R$ 0,00', refunded: 1 }),
    );
  });

  it('C5/CX-F04-F08 passo 15: após rajada de 30 compras, em até 10 s Confirmados 5 e Vagas 0 (E4 e E5)', async () => {
    for (const name of ['E4', 'E5']) {
      const e = await createEventHttp(app, a, { name, capacity: '5', price: '10,00' });
      expect((await publishHttp(app, a, e)).statusCode).toBe(302);
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          buyFetch(base, e, { buyerEmail: `carga${i}@example.com`, cardNumber: CARD.approvedFast }),
        ),
      );
      expect(countStatuses(results.map((r) => r.status)), name).toStrictEqual({ 202: 5, 409: 25 });
      const started = Date.now();
      const metrics = await waitFor(async () => {
        const m = (await panel(app, a, e)).metrics;
        return m.confirmed === '5' ? m : null;
      }, 10_000);
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(metrics).toStrictEqual(
        expected({ confirmed: 5, pending: 0, checkins: 0, available: 0, revenue: 'R$ 50,00', refunded: 0 }),
      );
    }
  });
});
